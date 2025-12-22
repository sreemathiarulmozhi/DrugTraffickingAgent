"""
Social Media Drug Detector Backend - Supports Instagram, Telegram & WhatsApp
Enhanced with robust error handling and JSON validation
"""
import os
import json
import uuid
import re
import asyncio
import time
import traceback
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from flask_cors import CORS
from langchain_groq import ChatGroq
from playwright.sync_api import sync_playwright
from werkzeug.exceptions import HTTPException

# Load environment variables
load_dotenv()

# --------- Config ---------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "llama-3.1-8b-instant"

# --------- Initialize Flask ---------
app = Flask(__name__)
CORS(app)

# --------- Initialize LLM ---------
llm = ChatGroq(api_key=GROQ_API_KEY, model=GROQ_MODEL)

# ============ CUSTOM ERROR CLASSES ============
class LLMResponseError(Exception):
    """Custom exception for LLM response parsing errors"""
    def __init__(self, message, raw_response=None):
        super().__init__(message)
        self.raw_response = raw_response
        self.error_type = "LLM_RESPONSE_ERROR"

class JSONValidationError(Exception):
    """Custom exception for JSON validation errors"""
    def __init__(self, message, json_data=None):
        super().__init__(message)
        self.json_data = json_data
        self.error_type = "JSON_VALIDATION_ERROR"

class EmbeddingError(Exception):
    """Custom exception for embedding-related errors"""
    def __init__(self, message):
        super().__init__(message)
        self.error_type = "EMBEDDING_ERROR"

# ============ ENHANCED UTILITY FUNCTIONS ============
def extract_json_from_llm_response(response_text):
    """
    Robust JSON extraction from LLM response with multiple fallback strategies
    """
    if not response_text or not isinstance(response_text, str):
        raise LLMResponseError("Empty or invalid LLM response")
    
    # Clean the response text first
    cleaned_text = response_text.strip()
    
    # Try multiple patterns in order of specificity
    patterns = [
        r'```json\s*(\{.*?\})\s*```',  # Markdown with json specifier
        r'```\s*(\{.*?\})\s*```',      # Generic markdown code block
        r'```\s*(.*?)\s*```',          # Any code block
        r'\{\s*"label"\s*:\s*".*?"\s*,\s*"score"\s*:\s*[^}]*\}',  # Exact pattern
        r'\{\s*.*?\}',                 # Any JSON object
    ]
    
    for i, pattern in enumerate(patterns):
        try:
            match = re.search(pattern, cleaned_text, re.DOTALL)
            if match:
                # Get the captured group if it exists
                json_str = match.group(1) if match.lastindex else match.group()
                json_str = json_str.strip()
                
                # Basic validation
                if json_str and json_str.startswith('{') and json_str.endswith('}'):
                    # Try to parse it to ensure it's valid JSON
                    try:
                        json.loads(json_str)
                        return json_str, f"pattern_{i}"
                    except json.JSONDecodeError:
                        # Try to fix common JSON issues
                        fixed_json = fix_common_json_issues(json_str)
                        if fixed_json:
                            try:
                                json.loads(fixed_json)
                                return fixed_json, f"pattern_{i}_fixed"
                            except:
                                continue
                continue
        except Exception:
            continue
    
    # Last resort: try to find any JSON-like structure
    try:
        # Look for the first { and last } in the text
        start = cleaned_text.find('{')
        end = cleaned_text.rfind('}')
        
        if start != -1 and end != -1 and end > start:
            json_str = cleaned_text[start:end+1].strip()
            # Try to fix it
            fixed_json = fix_common_json_issues(json_str)
            if fixed_json:
                try:
                    json.loads(fixed_json)
                    return fixed_json, "manual_extraction"
                except:
                    pass
    except Exception:
        pass
    
    return None, None

def fix_common_json_issues(json_str):
    """
    Fix common JSON formatting issues
    """
    if not json_str:
        return json_str
    
    # Fix 1: Replace single quotes with double quotes (but not in content)
    fixed = json_str
    
    # Fix 2: Ensure property names are quoted
    fixed = re.sub(r'(\s*)(\w+)(\s*):', r'\1"\2"\3:', fixed)
    
    # Fix 3: Handle trailing commas
    fixed = re.sub(r',\s*}', '}', fixed)
    fixed = re.sub(r',\s*]', ']', fixed)
    
    # Fix 4: Handle missing quotes in string values
    # This is more complex, so we'll be conservative
    lines = fixed.split('\n')
    fixed_lines = []
    
    for line in lines:
        # Look for unquoted string values after colons
        if ':' in line:
            parts = line.split(':')
            if len(parts) >= 2:
                key = parts[0].strip()
                value = ':'.join(parts[1:]).strip()
                
                # If value is not already quoted and doesn't look like a number or boolean
                if (not (value.startswith('"') and value.endswith('"')) and 
                    not (value.startswith("'") and value.endswith("'")) and
                    not value.replace('.', '', 1).isdigit() and
                    value not in ['true', 'false', 'null', 'True', 'False', 'None']):
                    # Add quotes
                    value = f'"{value}"'
                    
                fixed_line = f'{key}: {value}'
                fixed_lines.append(fixed_line)
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
    fixed = '\n'.join(fixed_lines)
    
    # Fix 5: Remove any newlines inside string values
    fixed = re.sub(r'"\s*\n\s*"', '""', fixed)
    
    return fixed

def validate_classification_json(json_data):
    """
    Validate classification JSON structure
    """
    if not isinstance(json_data, dict):
        raise JSONValidationError("Response must be a JSON object", json_data)
    
    required_keys = ['label', 'score', 'reason']
    
    missing_keys = [key for key in required_keys if key not in json_data]
    if missing_keys:
        raise JSONValidationError(f"Missing required keys: {missing_keys}", json_data)
    
    # Validate label
    label = json_data['label']
    if isinstance(label, str):
        label = label.lower().strip()
        if label not in ['risky', 'safe', 'medium']:
            # Try to normalize
            if 'risk' in label or 'danger' in label:
                json_data['label'] = 'risky'
            elif 'safe' in label or 'clean' in label:
                json_data['label'] = 'safe'
            else:
                json_data['label'] = 'medium'  # Default to medium for unknown
    else:
        raise JSONValidationError(f"Label must be a string, got {type(label)}", json_data)
    
    # Validate score
    score = json_data['score']
    try:
        if isinstance(score, str):
            score = float(score.strip())
        else:
            score = float(score)
        
        if not 0.0 <= score <= 1.0:
            # Clamp to valid range
            score = max(0.0, min(1.0, score))
        
        json_data['score'] = score
    except (ValueError, TypeError):
        # Default to 0.5 if score is invalid
        json_data['score'] = 0.5
    
    # Validate reason
    reason = json_data['reason']
    if not isinstance(reason, str):
        json_data['reason'] = str(reason) if reason else "No reason provided"
    
    if len(json_data['reason'].strip()) < 5:
        json_data['reason'] = "Brief analysis provided"
    
    return True

# ============ ERROR HANDLERS ============
@app.errorhandler(LLMResponseError)
def handle_llm_response_error(e):
    app.logger.error(f"LLM Response Error: {str(e)}")
    
    response = {
        "error": "LLM Response Parsing Error",
        "message": str(e),
        "type": e.error_type,
        "status": 422
    }
    
    if app.debug and hasattr(e, 'raw_response') and e.raw_response:
        response["debug_info"] = {"raw_response_preview": e.raw_response[:200]}
    
    return jsonify(response), 422

@app.errorhandler(JSONValidationError)
def handle_json_validation_error(e):
    app.logger.error(f"JSON Validation Error: {str(e)}")
    
    response = {
        "error": "JSON Validation Error",
        "message": str(e),
        "type": e.error_type,
        "status": 400
    }
    
    return jsonify(response), 400

@app.errorhandler(json.JSONDecodeError)
def handle_json_decode_error(e):
    app.logger.error(f"JSON Decode Error: {str(e)}")
    
    response = {
        "error": "Invalid JSON Format",
        "message": "The server could not parse JSON data.",
        "status": 400
    }
    
    return jsonify(response), 400

@app.errorhandler(HTTPException)
def handle_http_exception(e):
    app.logger.warning(f"HTTP Exception: {e.code} - {e.name}")
    return jsonify({
        "error": e.name,
        "message": e.description,
        "status": e.code
    }), e.code

@app.errorhandler(Exception)
def handle_generic_exception(e):
    app.logger.error(f"Unhandled Exception: {str(e)}\n{traceback.format_exc()}")
    
    error_message = "An internal server error occurred."
    if app.debug:
        error_message = f"{str(e)} - See server logs for details."
    
    return jsonify({
        "error": "Internal Server Error",
        "message": error_message,
        "status": 500,
        "timestamp": datetime.now().isoformat()
    }), 500

# --------- Telegram Client ---------
try:
    from telethon import TelegramClient
    TELEGRAM_AVAILABLE = True
except ImportError:
    TELEGRAM_AVAILABLE = False
    print("⚠️ Telethon not installed. Telegram features disabled.")

# --------- FIXED INSTAGRAM EMBEDDER ---------
class InstagramEmbedder:
    """Converts Instagram content to embeddings with PyTorch fix"""
    
    def __init__(self):
        self.model = None
        self.initialized = False
        
    def initialize(self):
        """Initialize sentence transformer with PyTorch fix"""
        if not self.initialized:
            try:
                import torch
                from sentence_transformers import SentenceTransformer
                
                print("🚀 Initializing Sentence Transformer for Instagram...")
                
                # Set device properly
                device = 'cpu'  # Use CPU to avoid GPU/meta tensor issues
                
                # Load model with specific settings to avoid meta tensor issues
                try:
                    # Try loading with safe settings
                    self.model = SentenceTransformer(
                        'all-MiniLM-L6-v2',
                        device=device
                    )
                except Exception as e:
                    # If that fails, try alternative approach
                    app.logger.warning(f"Standard loading failed: {e}, trying alternative...")
                    import os
                    os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
                    os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '0.0'
                    
                    # Force CPU and disable meta tensors
                    torch.set_grad_enabled(False)
                    self.model = SentenceTransformer('all-MiniLM-L6-v2')
                    self.model.to('cpu')
                    self.model.eval()
                
                self.initialized = True
                print("✅ Sentence Transformer ready for Instagram")
                
            except ImportError as e:
                raise EmbeddingError(f"Sentence Transformers not available: {str(e)}")
            except Exception as e:
                raise EmbeddingError(f"Failed to initialize Sentence Transformer: {str(e)}")
    
    def embed_instagram_content(self, caption, comments):
        """Convert Instagram content to embeddings for similarity search"""
        if not self.initialized or not self.model:
            return None
        
        try:
            import numpy as np
            
            texts_to_embed = []
            
            if caption and len(caption.strip()) > 10:
                texts_to_embed.append(f"CAPTION: {caption}")
            
            for comment in comments[:5]:
                if comment and len(comment.strip()) > 5:
                    texts_to_embed.append(f"COMMENT: {comment}")
            
            if not texts_to_embed:
                return None
            
            # Use safe encoding with small batch size
            embeddings = self.model.encode(
                texts_to_embed, 
                batch_size=1,  # Small batch to avoid memory issues
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            
            embedded_content = []
            for i, text in enumerate(texts_to_embed):
                if i < len(embeddings):
                    embedded_content.append({
                        'text': text,
                        'embedding': embeddings[i].tolist(),
                        'type': 'caption' if text.startswith('CAPTION:') else 'comment',
                        'original': text.replace('CAPTION: ', '').replace('COMMENT: ', '')
                    })
            
            return embedded_content
            
        except Exception as e:
            app.logger.error(f"Instagram embedding failed: {e}")
            raise EmbeddingError(f"Instagram embedding failed: {str(e)}")
    
    def find_similar_content(self, embedded_content, drug_keywords=None):
        """Find content similar to drug-related keywords"""
        if not embedded_content or not self.model:
            return []
        
        try:
            import numpy as np
            from sklearn.metrics.pairwise import cosine_similarity
            
            if drug_keywords is None:
                drug_keywords = [
                    "weed for sale", "cocaine available", "buy drugs",
                    "mdma pills", "lsd tabs", "heroin for sale",
                    "methamphetamine", "ecstasy pills", "shrooms",
                    "drug delivery", "discreet package", "hit me up for"
                ]
            
            # Encode keywords
            keyword_embeddings = self.model.encode(
                drug_keywords,
                batch_size=1,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            
            content_embeddings = np.array([item['embedding'] for item in embedded_content])
            
            # Calculate similarity
            similarities = cosine_similarity(content_embeddings, keyword_embeddings)
            max_similarities = similarities.max(axis=1)
            
            similar_content = []
            for i, item in enumerate(embedded_content):
                if max_similarities[i] > 0.3:
                    similar_content.append({
                        **item,
                        'similarity_score': float(max_similarities[i]),
                        'most_similar_keyword': drug_keywords[similarities[i].argmax()]
                    })
            
            return sorted(similar_content, key=lambda x: x['similarity_score'], reverse=True)
            
        except Exception as e:
            app.logger.error(f"Similarity search failed: {e}")
            return []

# Initialize Instagram embedder
instagram_embedder = InstagramEmbedder()

# --------- ENHANCED INSTAGRAM CLASSIFICATION ---------
def classify_instagram_with_embeddings(caption, comments):
    """Classify Instagram content using embeddings + LLM with robust error handling"""
    try:
        instagram_embedder.initialize()
    except EmbeddingError as e:
        app.logger.warning(f"Embedding initialization failed: {e}")
        embedded_content = None
        similar_content = []
    else:
        try:
            embedded_content = instagram_embedder.embed_instagram_content(caption, comments)
        except EmbeddingError as e:
            app.logger.warning(f"Embedding failed, using raw text: {e}")
            embedded_content = None
        
        similar_content = []
        if embedded_content:
            similar_content = instagram_embedder.find_similar_content(embedded_content)
    
    analysis_text = ""
    
    if caption:
        analysis_text += f"CAPTION:\n{caption}\n\n"
    
    if comments:
        analysis_text += f"COMMENTS ({len(comments)}):\n"
        for i, comment in enumerate(comments[:5], 1):
            analysis_text += f"{i}. {comment}\n"
    
    if similar_content:
        analysis_text += "\n🚨 SIMILARITY ANALYSIS:\n"
        for item in similar_content[:3]:
            analysis_text += f"- {item['type'].upper()}: Similarity {item['similarity_score']:.2f} to '{item['most_similar_keyword']}'\n"
    
    # Simplified prompt for better JSON output
    prompt = f"""
ANALYZE THIS INSTAGRAM CONTENT FOR DRUG TRAFFICKING INDICATORS:
## CRITICAL INDICATORS TO DETECT:
1. Drug names + selling: "weed for sale", "cocaine available"
2. Coded terms + contact: "DM for menu", "hit me up"
3. Prices + quantities: "$50 per g", "ounce available"
4. Emoji codes: "🍃", "💊", "❄️", "🔥"
5. Delivery language: "shipping", "discreet", "package"

## DECISION MATRIX:
IF (high similarity + drug terms) → RISKY 0.9
IF (multiple indicators) → RISKY 0.8
IF (similarity > 0.5 + suggestive language) → RISKY 0.7
IF (single ambiguous indicator) → MEDIUM 0.6
IF (no indicators) → SAFE 0.9
CONTENT:
{analysis_text}

RESPOND WITH THIS EXACT JSON FORMAT ONLY:
{{
  "label": "risky" or "safe",
  "score": 0.0 to 1.0,
  "reason": "Brief explanation of findings"
}}
"""
    
    try:
        response = llm.invoke(prompt)
        response_text = response.content
        
        app.logger.debug(f"Instagram LLM response: {response_text[:500]}")
        
        json_str, extraction_method = extract_json_from_llm_response(response_text)
        
        if not json_str:
            # Try to extract JSON more aggressively
            app.logger.warning("No JSON found with standard extraction, trying aggressive...")
            # Look for anything that looks like JSON
            json_match = re.search(r'\{[^{}]*\}', response_text)
            if json_match:
                json_str = json_match.group()
                # Try to fix it
                json_str = fix_common_json_issues(json_str)
            else:
                raise LLMResponseError(
                    "No valid JSON found in LLM response",
                    raw_response=response_text[:500]
                )
        
        try:
            result = json.loads(json_str)
        except json.JSONDecodeError as e:
            # Try to fix and parse again
            fixed_json = fix_common_json_issues(json_str)
            try:
                result = json.loads(fixed_json)
            except json.JSONDecodeError:
                raise LLMResponseError(
                    f"Failed to parse JSON after fixing: {str(e)}",
                    raw_response=json_str[:500]
                )
        
        # Validate and normalize the result
        validate_classification_json(result)
        
        # Add embedding info if available
        result['embedding_used'] = instagram_embedder.initialized and embedded_content is not None
        if similar_content:
            result['top_similarity'] = max([item['similarity_score'] for item in similar_content], default=0)
            result['similar_items_count'] = len(similar_content)
        
        return result
        
    except (LLMResponseError, JSONValidationError) as e:
        raise
    except Exception as e:
        raise LLMResponseError(f"Instagram classification error: {str(e)}")

# --------- Instagram Extraction ---------
def extract_instagram_text(url: str, max_comments=5):
    """Instagram extraction function with comments"""
    start_time = time.time()
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-dev-shm-usage']
            )
            
            page = browser.new_page()
            page.set_default_timeout(10000)
            
            page.goto(url, wait_until="domcontentloaded")
            
            caption_text = ""
            try:
                meta_desc = page.query_selector("meta[property='og:description']")
                if meta_desc:
                    caption_text = meta_desc.get_attribute("content") or ""
            except:
                pass
            
            if not caption_text or len(caption_text) < 10:
                try:
                    caption_elem = page.query_selector("article h1, article span")
                    if caption_elem:
                        caption_text = caption_elem.inner_text()[:500]
                except:
                    pass
            
            comments = []
            try:
                comment_elements = page.query_selector_all("span")
                for elem in comment_elements[:30]:
                    text = elem.inner_text().strip()
                    if (text and 
                        10 < len(text) < 200 and
                        text not in caption_text and
                        not text.startswith("@") and
                        "like" not in text.lower() and
                        "view" not in text.lower()):
                        comments.append(text)
                        if len(comments) >= max_comments:
                            break
            except:
                pass
            
            browser.close()
            
            elapsed = time.time() - start_time
            
            metadata = {
                "url": url,
                "caption": caption_text[:300] if caption_text else "",
                "comments": comments,
                "comments_count": len(comments),
                "extraction_time": elapsed
            }
            
            full_text = caption_text
            if comments:
                full_text += "\n\nComments:\n" + "\n".join(comments[:max_comments])
            
            return full_text.strip(), metadata
            
    except Exception as e:
        app.logger.error(f"Instagram extraction error: {str(e)[:100]}")
        return "", {"url": url, "caption": "", "comments": [], "comments_count": 0, "error": str(e)}

# --------- ENHANCED KEYWORD FALLBACK ---------
def keyword_fallback(text, error_reason="Fallback triggered", original_error=None):
    """Keyword fallback function with error tracking"""
    if original_error:
        app.logger.warning(f"Using keyword fallback due to: {error_reason} - Original error: {original_error}")
    
    text_lower = text.lower()
    
    patterns = {
        "explicit_drugs": {
            "regex": r'\b(weed|marijuana|cocaine|heroin|methamphetamine|meth|mdma|ecstasy|lsd|acid|shrooms|psychedelic)\b',
            "weight": 2.0
        },
        "selling_language": {
            "regex": r'\b(for sale|forsale|dm for|contact for|hit me up|available now|in stock)\b',
            "weight": 1.5
        },
        "prices": {
            "regex": r'\$\d+|\d+\s*(dollars|bucks)|per\s*(g|gram|oz|ounce)',
            "weight": 1.8
        },
        "quantities": {
            "regex": r'\b(\d+\s*(g|grams|oz|ounces|mg|pills|tablets|sheets))\b',
            "weight": 1.3
        },
        "delivery": {
            "regex": r'\b(delivery|shipping|discreet|package|ship|mail)\b',
            "weight": 1.0
        },
        "coded_terms": {
            "regex": r'\b(snow|candy|bars|green|fire|work|pack|gear|stuff)\b',
            "weight": 1.0
        },
        "contact_methods": {
            "regex": r'\b(whatsapp|telegram|signal|wickr|kik|email|pm)\b',
            "weight": 1.2
        },
        "drug_emojis": {
            "emojis": ['❄️', '🌨️', '🍃', '🌿', '🥦', '💊', '💉', '🥼', '🍬', '🍭', '🔥'],
            "weight": 1.5
        },
        "drug_hashtags": {
            "regex": r'#(420|weed|marijuana|thc|cbd|cocaine|snow|coke|mdma|molly|ecstasy|lsd|acid|shrooms|xanax|adderall|oxy)',
            "weight": 0.8
        }
    }
    
    total_score = 0
    indicators_found = []
    
    for pattern_name, pattern_info in patterns.items():
        if "regex" in pattern_info:
            matches = re.findall(pattern_info["regex"], text_lower, re.IGNORECASE)
            if matches:
                count = len(matches)
                score = count * pattern_info["weight"]
                total_score += score
                indicators_found.append(f"{pattern_name}({count})")
    
    if "emojis" in patterns.get("drug_emojis", {}):
        emoji_count = sum(1 for emoji in patterns["drug_emojis"]["emojis"] if emoji in text)
        if emoji_count > 0:
            score = emoji_count * patterns["drug_emojis"]["weight"]
            total_score += score
            indicators_found.append(f"emojis({emoji_count})")
    
    if total_score >= 3.0:
        confidence = min(0.9, 0.5 + (total_score * 0.1))
        return {
            "label": "risky",
            "score": round(confidence, 2),
            "reason": f"Multiple indicators: {', '.join(indicators_found[:3])}. {error_reason}",
            "fallback_used": True,
            "original_error": str(original_error) if original_error else None
        }
    elif total_score >= 1.5:
        return {
            "label": "risky",
            "score": round(0.5 + (total_score * 0.1), 2),
            "reason": f"Some indicators: {', '.join(indicators_found[:2])}. {error_reason}",
            "fallback_used": True,
            "original_error": str(original_error) if original_error else None
        }
    else:
        return {
            "label": "safe",
            "score": 0.85,
            "reason": f"No strong drug trafficking indicators. {error_reason}",
            "fallback_used": True,
            "original_error": str(original_error) if original_error else None
        }

# --------- ENHANCED TELEGRAM CLASSIFICATION ---------
def classify_telegram_message(text):
    """Enhanced classification for Telegram messages with robust error handling"""
    app.logger.info(f"Analyzing Telegram message: {text[:100]}...")
    
    # Simplified prompt for better JSON output
    prompt = f"""
ANALYZE THIS MESSAGE FOR DRUG TRAFFICKING:

## CRITICAL INDICATORS TO DETECT:
1. Drug names + selling: "weed for sale", "cocaine available"
2. Coded terms + contact: "DM for menu", "hit me up"
3. Prices + quantities: "$50 per g", "ounce available"
4. Emoji codes: "🍃", "💊", "❄️", "🔥"
5. Delivery language: "shipping", "discreet", "package"

## DECISION MATRIX:
IF (high similarity + drug terms) → RISKY 0.9
IF (multiple indicators) → RISKY 0.8
IF (similarity > 0.5 + suggestive language) → RISKY 0.7
IF (single ambiguous indicator) → MEDIUM 0.6
IF (no indicators) → SAFE 0.9
MESSAGE: "{text}"

RESPOND WITH THIS EXACT JSON FORMAT ONLY:
{{
  "label": "risky" or "safe",
  "score": 0.0 to 1.0,
  "reason": "Brief explanation"
}}
"""
    
    try:
        response = llm.invoke(prompt)
        response_text = response.content
        
        app.logger.debug(f"Telegram LLM response: {response_text[:500]}")
        
        json_str, extraction_method = extract_json_from_llm_response(response_text)
        
        if not json_str:
            # Try to extract JSON more aggressively
            json_match = re.search(r'\{[^{}]*\}', response_text)
            if json_match:
                json_str = json_match.group()
                json_str = fix_common_json_issues(json_str)
            else:
                raise LLMResponseError(
                    "No valid JSON found in LLM response",
                    raw_response=response_text[:500]
                )
        
        try:
            result = json.loads(json_str)
        except json.JSONDecodeError as e:
            # Try to fix and parse again
            fixed_json = fix_common_json_issues(json_str)
            try:
                result = json.loads(fixed_json)
            except json.JSONDecodeError:
                raise LLMResponseError(
                    f"Failed to parse JSON after fixing: {str(e)}",
                    raw_response=json_str[:500]
                )
        
        # Validate and normalize the result
        validate_classification_json(result)
        
        app.logger.info(f"Successfully classified message as '{result['label']}' with score {result['score']}")
        return result
        
    except (LLMResponseError, JSONValidationError) as e:
        raise
    except Exception as e:
        raise LLMResponseError(f"Telegram analysis error: {str(e)}")

# --------- HEALTH CHECK ---------
@app.route("/health", methods=["GET"])
def health_check():
    """Enhanced health check with component validation"""
    health_status = {
        "status": "healthy",
        "service": "Social Media Drug Detector API",
        "timestamp": datetime.now().isoformat(),
        "components": {},
        "version": "1.1.0"
    }
    
    try:
        test_response = llm.invoke("Say 'ok'")
        health_status["components"]["llm"] = {
            "status": "connected",
            "model": GROQ_MODEL,
            "response_valid": bool(test_response and test_response.content)
        }
    except Exception as e:
        health_status["components"]["llm"] = {
            "status": "error",
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    try:
        test_json = '{"test": "value"}'
        parsed = json.loads(test_json)
        health_status["components"]["json_parsing"] = {
            "status": "ok",
            "test_passed": True
        }
    except Exception as e:
        health_status["components"]["json_parsing"] = {
            "status": "error",
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    health_status["error_handlers"] = {
        "json_decode": "active",
        "llm_response": "active",
        "validation": "active",
        "generic": "active"
    }
    
    health_status["telegram"] = "available" if TELEGRAM_AVAILABLE else "not_available"
    health_status["instagram"] = "available"
    
    return jsonify(health_status)

# --------- INSTAGRAM ENDPOINT ---------
@app.route("/api/analyze", methods=["POST"])
def analyze():
    """Instagram analysis with embeddings"""
    try:
        body = request.get_json()
        if not body:
            return jsonify({"error": "Request body is empty"}), 400
        
        url = body.get("url")
        test_content = body.get("test_content")
        
        if test_content:
            text = test_content
            metadata = {
                "url": url or "test_url",
                "caption": test_content,
                "comments": [],
                "comments_count": 0,
                "is_test": True
            }
            caption = test_content
            comments = []
        elif url and url.startswith("http"):
            try:
                text, metadata = extract_instagram_text(url)
                caption = metadata.get("caption", "")
                comments = metadata.get("comments", [])
            except Exception as e:
                return jsonify({
                    "id": str(uuid.uuid4()),
                    "url": url,
                    "metadata": {"url": url, "caption": "", "comments": [], "comments_count": 0},
                    "classification": {
                        "label": "error",
                        "score": 0.0,
                        "reason": f"Failed to fetch: {str(e)}"
                    }
                }), 200
        else:
            return jsonify({"error": "Missing url or test_content"}), 400

        doc_id = str(uuid.uuid4())

        try:
            classification = classify_instagram_with_embeddings(caption, comments)
        except (LLMResponseError, JSONValidationError) as e:
            classification = keyword_fallback(
                caption + " " + " ".join(comments),
                f"LLM analysis failed: {e.error_type}",
                e
            )
        except Exception as e:
            classification = keyword_fallback(
                caption + " " + " ".join(comments),
                f"Unexpected error: {str(e)}",
                e
            )

        response = jsonify({
            "id": doc_id,
            "url": url or "test_url",
            "metadata": metadata,
            "classification": classification,
            "embedding_info": {
                "used": instagram_embedder.initialized,
                "model": "all-MiniLM-L6-v2" if instagram_embedder.initialized else "none"
            },
            "timestamp": datetime.now().isoformat()
        })
        
        response.headers.add("Access-Control-Allow-Origin", "*")
        return response
        
    except Exception as e:
        app.logger.error(f"Error in Instagram endpoint: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": "Internal server error",
            "message": str(e)
        }), 500

# --------- Sentence Transformer for Embeddings ---------
class TelegramMessageEmbedder:
    """Converts Telegram messages to embeddings for LLM analysis"""
    
    def __init__(self):
        self.model = None
        self.initialized = False
        
    def initialize(self):
        """Initialize sentence transformer with PyTorch fix"""
        if not self.initialized:
            try:
                import torch
                from sentence_transformers import SentenceTransformer
                
                print("🚀 Initializing Sentence Transformer for message embeddings...")
                
                # Force CPU to avoid meta tensor issues
                device = 'cpu'
                
                try:
                    self.model = SentenceTransformer(
                        'all-MiniLM-L6-v2',
                        device=device
                    )
                except Exception as e:
                    # Fallback approach
                    app.logger.warning(f"Standard loading failed: {e}, trying alternative...")
                    import os
                    os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
                    
                    torch.set_grad_enabled(False)
                    self.model = SentenceTransformer('all-MiniLM-L6-v2')
                    self.model.to('cpu')
                    self.model.eval()
                
                self.initialized = True
                print("✅ Sentence Transformer ready for message embeddings")
                
            except ImportError as e:
                raise EmbeddingError(f"Sentence Transformers not available: {str(e)}")
            except Exception as e:
                raise EmbeddingError(f"Failed to initialize Sentence Transformer: {str(e)}")
    
    def embed_messages(self, messages, batch_size=1):  # Reduced batch size
        """Convert messages to embeddings for LLM context"""
        if not self.initialized or not self.model:
            return self._prepare_raw_text(messages)
        
        try:
            import numpy as np
            
            message_texts = []
            message_metadata = []
            
            for msg in messages:
                text = msg.get('text', '')
                if text and len(text.strip()) > 5:
                    lower_text = text.lower()
                    if any(fp in lower_text for fp in [
                        'login code', 'verification code', 'do not give this code',
                        'telegram team', 'welcome to', 'joined the group'
                    ]):
                        continue
                    
                    message_texts.append(text)
                    message_metadata.append({
                        'text': text,
                        'chat_name': msg.get('chat_name', 'Unknown'),
                        'chat_type': msg.get('chat_type', 'private'),
                        'message_id': msg.get('message_id'),
                        'sender': msg.get('sender', ''),
                        'date': msg.get('date')
                    })
            
            if not message_texts:
                return []
            
            # Use safe encoding with small batch size
            embeddings = self.model.encode(
                message_texts,
                batch_size=batch_size,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            
            embedded_messages = []
            for i, metadata in enumerate(message_metadata):
                if i < len(embeddings):
                    embedded_messages.append({
                        **metadata,
                        'embedding': embeddings[i].tolist(),
                        'embedding_dim': len(embeddings[i])
                    })
                else:
                    embedded_messages.append(metadata)
            
            return embedded_messages
            
        except Exception as e:
            app.logger.error(f"Sentence transformer embedding failed: {e}")
            return self._prepare_raw_text(messages)
    
    def _prepare_raw_text(self, messages):
        """Fallback: prepare raw text for LLM"""
        prepared = []
        for msg in messages:
            text = msg.get('text', '')
            if text and len(text.strip()) > 5:
                lower_text = text.lower()
                if any(fp in lower_text for fp in [
                    'login code', 'verification code', 'do not give this code'
                ]):
                    continue
                
                prepared.append({
                    'text': text,
                    'chat_name': msg.get('chat_name', 'Unknown'),
                    'chat_type': msg.get('chat_type', 'private'),
                    'message_id': msg.get('message_id'),
                    'sender': msg.get('sender', ''),
                    'date': msg.get('date')
                })
        return prepared

# Initialize embedder
telegram_embedder = TelegramMessageEmbedder()

# --------- Telegram Scanner ---------
class TelegramScanner:
    """Simple Telegram chat scanner"""
    
    def __init__(self):
        self.api_id = int(os.getenv("TELEGRAM_API_ID", 0))
        self.api_hash = os.getenv("TELEGRAM_API_HASH", "")
        self.phone = os.getenv("TELEGRAM_PHONE", "")
    
    async def scan_chats_async(self, chat_limit=5, messages_per_chat=5):
        """Async Telegram scanning"""
        from telethon import TelegramClient
        
        client = None
        try:
            session_name = f"telegram_session_{int(time.time())}"
            client = TelegramClient(session_name, self.api_id, self.api_hash)
            
            await client.start(phone=self.phone)
            
            app.logger.info(f"Scanning {chat_limit} Telegram chats...")
            dialogs = await client.get_dialogs(limit=chat_limit)
            
            all_chats = []
            total_messages = 0
            
            for dialog in dialogs:
                if dialog.is_channel or dialog.is_group or dialog.is_user:
                    chat_name = dialog.name or dialog.title or "Unknown"
                    
                    messages = []
                    async for message in client.iter_messages(
                        dialog.entity, 
                        limit=messages_per_chat
                    ):
                        if message.text:
                            messages.append({
                                'id': message.id,
                                'date': message.date.isoformat() if hasattr(message.date, 'isoformat') else str(message.date),
                                'text': message.text,
                                'sender': getattr(message.sender, 'first_name', '') if hasattr(message, 'sender') else '',
                                'chat_name': chat_name,
                                'chat_type': 'channel' if dialog.is_channel else 'group' if dialog.is_group else 'private'
                            })
                    
                    if messages:
                        all_chats.append({
                            'chat_name': chat_name,
                            'chat_id': dialog.id,
                            'type': 'channel' if dialog.is_channel else 'group' if dialog.is_group else 'private',
                            'messages': messages,
                            'message_count': len(messages)
                        })
                        total_messages += len(messages)
            
            await client.disconnect()
            
            return {
                'total_chats_scanned': len(all_chats),
                'total_messages': total_messages,
                'chats': all_chats
            }
            
        except Exception as e:
            if client:
                try:
                    await client.disconnect()
                except:
                    pass
            raise e
    
    def scan_recent_chats(self, chat_limit=5, messages_per_chat=5):
        """Sync wrapper for Telegram scanning"""
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            result = loop.run_until_complete(
                self.scan_chats_async(chat_limit, messages_per_chat)
            )
            
            loop.close()
            return result
            
        except Exception as e:
            app.logger.error(f"Telegram scan error: {e}")
            return {"error": str(e)}

# Initialize scanner
telegram_scanner = TelegramScanner() if TELEGRAM_AVAILABLE else None

# --------- ENHANCED TELEGRAM ENDPOINT ---------
@app.route("/api/analyze/telegram", methods=["POST"])
def analyze_telegram():
    """Telegram analysis with comprehensive error handling"""
    start_time = time.time()
    request_id = str(uuid.uuid4())
    
    app.logger.info(f"[{request_id}] Telegram analysis request received")
    
    if not TELEGRAM_AVAILABLE:
        return jsonify({
            "error": "Telegram features not available",
            "message": "Install telethon library: pip install telethon"
        }), 400
    
    try:
        body = request.get_json() or {}
        
        if not body:
            raise JSONValidationError("Request body is empty or invalid JSON")
        
        chat_limit = min(body.get('chat_limit', 3), 5)
        messages_per_chat = min(body.get('messages_per_chat', 3), 5)
        
        app.logger.info(f"[{request_id}] Starting scan ({chat_limit} chats, {messages_per_chat} msgs each)...")
        
        scan_result = telegram_scanner.scan_recent_chats(chat_limit, messages_per_chat)
        
        if 'error' in scan_result:
            return jsonify({
                "id": request_id,
                "platform": "telegram",
                "error": scan_result['error'],
                "timestamp": datetime.now().isoformat()
            }), 200
        
        scan_time = time.time()
        total_messages = scan_result.get('total_messages', 0)
        app.logger.info(f"[{request_id}] Scanned {total_messages} messages in {scan_time - start_time:.1f}s")
        
        try:
            telegram_embedder.initialize()
        except EmbeddingError as e:
            app.logger.warning(f"[{request_id}] Embedding initialization failed: {e}")
        
        all_messages = []
        chat_mapping = {}
        
        for chat in scan_result.get('chats', []):
            chat_id = chat.get('chat_id')
            chat_name = chat.get('chat_name', 'Unknown')
            
            for msg in chat.get('messages', []):
                message_data = {
                    'chat_id': chat_id,
                    'chat_name': chat_name,
                    'chat_type': chat.get('type', 'private'),
                    'message_id': msg.get('id'),
                    'text': msg.get('text', ''),
                    'sender': msg.get('sender', ''),
                    'date': msg.get('date'),
                    'original_msg': msg
                }
                all_messages.append(message_data)
                
                if chat_id not in chat_mapping:
                    chat_mapping[chat_id] = {
                        'name': chat_name,
                        'type': chat.get('type', 'private'),
                        'message_count': 0
                    }
                chat_mapping[chat_id]['message_count'] += 1
        
        app.logger.info(f"[{request_id}] Converting {len(all_messages)} messages to embeddings...")
        
        embed_start = time.time()
        embedded_messages = telegram_embedder.embed_messages(all_messages, batch_size=1)
        embed_time = time.time() - embed_start
        
        app.logger.info(f"[{request_id}] Created embeddings for {len(embedded_messages)} messages in {embed_time:.1f}s")
        
        app.logger.info(f"[{request_id}] Analyzing {len(embedded_messages)} messages with LLM...")
        llm_start = time.time()
        
        risky_messages = []
        chat_risky_counts = {}
        
        for i, msg in enumerate(embedded_messages):
            try:
                analysis = classify_telegram_message(msg['text'])
                
                if analysis.get('label') == 'risky' and analysis.get('score', 0) > 0.5:
                    chat_id = None
                    chat_name = msg.get('chat_name', 'Unknown')
                    
                    for original_msg in all_messages:
                        if (original_msg.get('text') == msg['text'] and 
                            original_msg.get('chat_name') == chat_name):
                            chat_id = original_msg.get('chat_id')
                            break
                    
                    if chat_id:
                        risky_msg = {
                            'chat_id': chat_id,
                            'chat_name': chat_name,
                            'chat_type': msg.get('chat_type', 'private'),
                            'message_id': msg.get('message_id'),
                            'text': msg['text'][:150],
                            'full_text': msg['text'],
                            'score': analysis['score'],
                            'reason': analysis['reason'],
                            'sender': msg.get('sender', ''),
                            'date': msg.get('date'),
                            'has_embedding': 'embedding' in msg,
                            'embedding_dim': msg.get('embedding_dim', 0)
                        }
                        
                        risky_messages.append(risky_msg)
                        
                        if chat_id not in chat_risky_counts:
                            chat_risky_counts[chat_id] = {
                                'chat_name': chat_name,
                                'chat_type': msg.get('chat_type', 'private'),
                                'count': 0,
                                'scores': [],
                                'messages': []
                            }
                        
                        chat_risky_counts[chat_id]['count'] += 1
                        chat_risky_counts[chat_id]['scores'].append(analysis['score'])
                        chat_risky_counts[chat_id]['messages'].append(risky_msg)
                        
            except (LLMResponseError, JSONValidationError) as e:
                app.logger.warning(f"[{request_id}] Message {i+1} analysis failed: {str(e)}")
                analysis = keyword_fallback(
                    msg['text'], 
                    f"LLM analysis failed: {e.error_type}", 
                    e
                )
                
                if analysis.get('label') == 'risky' and analysis.get('score', 0) > 0.5:
                    risky_msg = {
                        'chat_id': None,
                        'chat_name': msg.get('chat_name', 'Unknown'),
                        'chat_type': msg.get('chat_type', 'private'),
                        'message_id': msg.get('message_id'),
                        'text': msg['text'][:150],
                        'full_text': msg['text'],
                        'score': analysis['score'],
                        'reason': analysis['reason'],
                        'sender': msg.get('sender', ''),
                        'date': msg.get('date'),
                        'has_embedding': 'embedding' in msg,
                        'embedding_dim': msg.get('embedding_dim', 0),
                        'fallback_used': True
                    }
                    risky_messages.append(risky_msg)
                    
            except Exception as e:
                app.logger.error(f"[{request_id}] Error analyzing message {i+1}: {e}")
                continue
        
        llm_time = time.time() - llm_start
        
        risky_chats = []
        for chat_id, data in chat_risky_counts.items():
            if data['count'] > 0:
                avg_score = sum(data['scores']) / len(data['scores'])
                max_score = max(data['scores'])
                
                risky_chats.append({
                    'chat_id': chat_id,
                    'chat_name': data['chat_name'],
                    'chat_type': data['chat_type'],
                    'total_messages': chat_mapping.get(chat_id, {}).get('message_count', 0),
                    'risky_message_count': data['count'],
                    'risk_score': round(avg_score, 2),
                    'max_risk_score': round(max_score, 2),
                    'reason': f"Found {data['count']} drug-related messages",
                    'sample_messages': [
                        {
                            'text': msg['text'][:80] + "..." if len(msg['text']) > 80 else msg['text'],
                            'score': msg['score'],
                            'reason': msg['reason'][:60] + "..." if len(msg['reason']) > 60 else msg['reason']
                        }
                        for msg in data['messages'][:3]
                    ]
                })
        
        risky_messages.sort(key=lambda x: x['score'], reverse=True)
        risky_chats.sort(key=lambda x: x['risk_score'], reverse=True)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        response_data = {
            "id": request_id,
            "platform": "telegram",
            "status": "success",
            "processing_time_seconds": round(total_time, 2),
            "timing_breakdown": {
                "scanning": round(scan_time - start_time, 2),
                "embedding": round(embed_time, 2),
                "llm_analysis": round(llm_time, 2),
                "total": round(total_time, 2)
            },
            "scan_summary": {
                "chats_scanned": len(scan_result.get('chats', [])),
                "messages_scanned": total_messages,
                "messages_embedded": len(embedded_messages),
                "messages_analyzed": len(embedded_messages),
                "risky_chats_found": len(risky_chats),
                "risky_messages_found": len(risky_messages),
                "scanned_at": datetime.now().isoformat(),
                "method": "sentence_transformer_embeddings_llm"
            },
            "risky_chats": risky_chats,
            "risky_messages": [
                {
                    'chat_name': msg['chat_name'],
                    'chat_type': msg['chat_type'],
                    'message': msg['text'],
                    'full_message': msg.get('full_text', msg['text']),
                    'risk_score': msg['score'],
                    'reason': msg['reason'],
                    'sender': msg['sender'],
                    'date': msg['date'],
                    'has_embedding': msg.get('has_embedding', False),
                    'embedding_dim': msg.get('embedding_dim', 0),
                    'fallback_used': msg.get('fallback_used', False)
                }
                for msg in risky_messages[:10]
            ],
            "all_chats_overview": [
                {
                    'chat_name': chat.get('chat_name', 'Unknown'),
                    'chat_type': chat.get('type', 'private'),
                    'message_count': len(chat.get('messages', [])),
                    'has_risky_content': any(rm['chat_name'] == chat.get('chat_name') for rm in risky_messages)
                }
                for chat in scan_result.get('chats', [])
            ],
            "embedding_info": {
                "model_used": "all-MiniLM-L6-v2" if telegram_embedder.initialized else "none",
                "messages_with_embeddings": sum(1 for msg in embedded_messages if 'embedding' in msg),
                "embedding_dimensionality": embedded_messages[0].get('embedding_dim', 0) if embedded_messages else 0
            },
            "timestamp": datetime.now().isoformat()
        }
        
        app.logger.info(f"[{request_id}] Telegram analysis complete in {total_time:.1f}s")
        app.logger.info(f"[{request_id}] Results: {len(risky_messages)} drug messages in {len(risky_chats)} chats")
        
        return jsonify(response_data)
        
    except json.JSONDecodeError as e:
        app.logger.error(f"[{request_id}] Invalid JSON in request: {str(e)}")
        raise
    except JSONValidationError as e:
        app.logger.error(f"[{request_id}] Request validation failed: {str(e)}")
        raise
    except Exception as e:
        app.logger.error(f"[{request_id}] Unexpected error in Telegram endpoint: {str(e)}\n{traceback.format_exc()}")
        raise

# --------- WhatsApp Endpoint ---------
@app.route("/api/analyze/whatsapp", methods=["POST"])
def analyze_whatsapp():
    """WhatsApp message analysis with detailed logging"""
    start_time = time.time()
    request_id = str(uuid.uuid4())
    
    app.logger.info(f"[{request_id}] WhatsApp analysis started")
    
    try:
        body = request.get_json() or {}
        messages = body.get('messages', [])
        
        if not messages:
            app.logger.error(f"[{request_id}] No messages received from extension")
            return jsonify({
                "error": "No messages provided",
                "message": "Please provide WhatsApp messages to analyze"
            }), 400
        
        app.logger.info(f"[{request_id}] Received {len(messages)} messages for analysis")
        
        chat_summary = {}
        for msg in messages[:10]:
            chat_name = msg.get('chat_name', 'Unknown')
            if chat_name not in chat_summary:
                chat_summary[chat_name] = 0
            chat_summary[chat_name] += 1
        
        app.logger.info(f"[{request_id}] Chats summary: {chat_summary}")
        
        try:
            from sentence_transformers import SentenceTransformer, util
            import torch
            
            # Initialize with PyTorch fix
            import os
            os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
            torch.set_grad_enabled(False)
            
            model = SentenceTransformer('all-MiniLM-L6-v2')
            model.to('cpu')
            model.eval()
            
            app.logger.info(f"[{request_id}] Sentence Transformer initialized")
        except Exception as e:
            app.logger.error(f"[{request_id}] Failed to initialize Sentence Transformer: {e}")
            raise EmbeddingError(f"Failed to initialize Sentence Transformer: {str(e)}")
        
        message_texts = []
        message_metadata = []
        
        for i, msg in enumerate(messages):
            text = msg.get('text', '')
            if text and len(text.strip()) > 5:
                lower_text = text.lower()
                skip_keywords = ['login code', 'verification code', 'qr code', 'whatsapp web']
                if any(keyword in lower_text for keyword in skip_keywords):
                    continue
                
                message_texts.append(text)
                message_metadata.append({
                    'text': text,
                    'chat_name': msg.get('chat_name', f'Chat_{i}'),
                    'sender': msg.get('sender', 'Unknown'),
                    'timestamp': msg.get('timestamp'),
                    'original_index': i
                })
        
        if not message_texts:
            app.logger.info(f"[{request_id}] No analyzable messages after filtering")
            return jsonify({
                "id": request_id,
                "platform": "whatsapp",
                "scan_summary": {
                    "total_messages_scanned": 0,
                    "risky_chats_found": 0,
                    "risky_messages_found": 0,
                    "note": "No analyzable messages found"
                },
                "timestamp": datetime.now().isoformat()
            })
        
        embed_start = time.time()
        embeddings = model.encode(
            message_texts,
            batch_size=1,
            convert_to_numpy=True,
            normalize_embeddings=True
        )
        embed_time = time.time() - embed_start
        
        app.logger.info(f"[{request_id}] Created {len(embeddings)} embeddings in {embed_time:.2f}s")
        
        drug_keywords = [
            "weed for sale", "cocaine available", "buy drugs",
            "mdma pills", "lsd tabs", "heroin for sale",
            "methamphetamine", "ecstasy", "shrooms",
            "drug delivery", "discreet package", "hit me up",
            "per gram", "per ounce", "quantity available",
            "💊", "🍃", "❄️", "🔥", "💉"
        ]
        
        keyword_embeddings = model.encode(
            drug_keywords,
            batch_size=1,
            convert_to_numpy=True,
            normalize_embeddings=True
        )
        
        similarities = util.cos_sim(embeddings, keyword_embeddings)
        
        risky_messages = []
        chat_risky_counts = {}
        
        for i, metadata in enumerate(message_metadata):
            max_similarity = float(torch.max(similarities[i]))
            most_similar_keyword = drug_keywords[torch.argmax(similarities[i]).item()]
            
            if max_similarity > 0.4:
                app.logger.info(f"[{request_id}] High similarity ({max_similarity:.2f}) in message: '{metadata['text'][:50]}...'")
            
            if max_similarity > 0.3:
                try:
                    analysis = classify_telegram_message(metadata['text'])
                    
                    if analysis.get('label') == 'risky' and analysis.get('score', 0) > 0.5:
                        chat_name = metadata['chat_name']
                        
                        risky_msg = {
                            'chat_name': chat_name,
                            'text': metadata['text'][:150],
                            'full_text': metadata['text'],
                            'similarity_score': float(max_similarity),
                            'similar_keyword': most_similar_keyword,
                            'llm_score': analysis['score'],
                            'llm_reason': analysis['reason'],
                            'sender': metadata['sender'],
                            'timestamp': metadata['timestamp']
                        }
                        
                        risky_messages.append(risky_msg)
                        
                        if chat_name not in chat_risky_counts:
                            chat_risky_counts[chat_name] = {
                                'count': 0,
                                'scores': [],
                                'similarities': [],
                                'messages': []
                            }
                        
                        chat_risky_counts[chat_name]['count'] += 1
                        chat_risky_counts[chat_name]['scores'].append(analysis['score'])
                        chat_risky_counts[chat_name]['similarities'].append(float(max_similarity))
                        chat_risky_counts[chat_name]['messages'].append(risky_msg)
                        
                        app.logger.info(f"[{request_id}] Risky message detected in chat: {chat_name}, score: {analysis['score']:.2f}")
                        
                except (LLMResponseError, JSONValidationError) as e:
                    app.logger.warning(f"[{request_id}] LLM analysis failed for message, using fallback: {e}")
                    analysis = keyword_fallback(
                        metadata['text'],
                        f"LLM analysis failed: {e.error_type}",
                        e
                    )
                    
                    if analysis.get('label') == 'risky' and analysis.get('score', 0) > 0.5:
                        risky_msg = {
                            'chat_name': metadata['chat_name'],
                            'text': metadata['text'][:150],
                            'full_text': metadata['text'],
                            'similarity_score': float(max_similarity),
                            'similar_keyword': most_similar_keyword,
                            'llm_score': analysis['score'],
                            'llm_reason': analysis['reason'],
                            'sender': metadata['sender'],
                            'timestamp': metadata['timestamp'],
                            'fallback_used': True
                        }
                        risky_messages.append(risky_msg)
                
                except Exception as e:
                    app.logger.error(f"[{request_id}] Error analyzing message: {e}")
                    continue
        
        risky_chats = []
        
        for chat_name, data in chat_risky_counts.items():
            if data['count'] > 0:
                avg_score = sum(data['scores']) / len(data['scores'])
                avg_similarity = sum(data['similarities']) / len(data['similarities'])
                
                risky_chats.append({
                    'chat_name': chat_name,
                    'risky_message_count': data['count'],
                    'risk_score': round(avg_score, 2),
                    'avg_similarity': round(avg_similarity, 2),
                    'max_similarity': max(data['similarities']),
                    'sample_messages': [
                        {
                            'text': msg['text'][:80] + "..." if len(msg['text']) > 80 else msg['text'],
                            'score': msg['llm_score'],
                            'similarity': msg['similarity_score']
                        }
                        for msg in data['messages'][:2]
                    ]
                })
        
        risky_messages.sort(key=lambda x: x['llm_score'], reverse=True)
        risky_chats.sort(key=lambda x: x['risk_score'], reverse=True)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        app.logger.info(f"[{request_id}] WhatsApp analysis complete in {total_time:.2f}s")
        app.logger.info(f"[{request_id}] Messages scanned: {len(message_texts)}, Risky messages: {len(risky_messages)}, Risky chats: {len(risky_chats)}")
        
        response_data = {
            "id": request_id,
            "platform": "whatsapp",
            "status": "success",
            "processing_time_seconds": round(total_time, 2),
            "scan_summary": {
                "total_messages_scanned": len(message_texts),
                "messages_with_embeddings": len(embeddings),
                "risky_chats_found": len(risky_chats),
                "risky_messages_found": len(risky_messages),
                "scanned_at": datetime.now().isoformat(),
                "method": "sentence_transformers_llm"
            },
            "risky_chats": risky_chats,
            "risky_messages": [
                {
                    'chat_name': msg['chat_name'],
                    'message_preview': msg['text'],
                    'risk_score': round(msg['llm_score'], 2),
                    'similarity_score': round(msg['similarity_score'], 2),
                    'reason': msg['llm_reason'],
                    'sender': msg['sender'],
                    'fallback_used': msg.get('fallback_used', False)
                }
                for msg in risky_messages[:5]
            ],
            "embedding_info": {
                "model_used": "all-MiniLM-L6-v2",
                "embedding_dimensionality": embeddings.shape[1] if hasattr(embeddings, 'shape') else 384,
                "similarity_threshold": 0.3
            },
            "detailed_logs": {
                "chats_processed": list(chat_summary.keys()),
                "messages_per_chat": chat_summary,
                "embedding_time": round(embed_time, 2)
            },
            "timestamp": datetime.now().isoformat()
        }
        
        return jsonify(response_data)
        
    except json.JSONDecodeError as e:
        app.logger.error(f"[{request_id}] Invalid JSON in request: {str(e)}")
        raise
    except Exception as e:
        app.logger.error(f"[{request_id}] Unexpected error in WhatsApp endpoint: {str(e)}\n{traceback.format_exc()}")
        raise

# --------- 404 Handler ---------
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "error": "Endpoint not found",
        "available_endpoints": [
            "GET  /",
            "GET  /health", 
            "POST /api/analyze",
            "POST /api/analyze/telegram",
            "POST /api/analyze/whatsapp"
        ]
    }), 404

# --------- Root Endpoint ---------
@app.route("/", methods=["GET"])
def root():
    """Root endpoint with API information"""
    return jsonify({
        "service": "Social Media Drug Detector API",
        "version": "1.2.0",
        "status": "running",
        "endpoints": {
            "GET /": "This information",
            "GET /health": "Health check",
            "POST /api/analyze": "Instagram post analysis",
            "POST /api/analyze/telegram": "Telegram chat analysis",
            "POST /api/analyze/whatsapp": "WhatsApp chat analysis"
        },
        "features": {
            "instagram": "Auto-detection with embeddings",
            "telegram": "Sentence Transformer + LLM analysis",
            "whatsapp": "Sentence Transformer + LLM analysis",
            "model": GROQ_MODEL,
            "error_handling": "Enhanced with custom error handlers",
            "json_fixes": "Automatic JSON formatting fixes"
        },
        "timestamp": datetime.now().isoformat()
    })

# --------- Setup Logging ---------
def setup_logging():
    """Configure application logging"""
    log_dir = "logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    logging.basicConfig(
        level=logging.DEBUG if app.debug else logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(os.path.join(log_dir, 'app.log')),
            logging.StreamHandler()
        ]
    )
    
    app.logger = logging.getLogger(__name__)
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('playwright').setLevel(logging.WARNING)
    logging.getLogger('telethon').setLevel(logging.WARNING)
    logging.getLogger('sentence_transformers').setLevel(logging.WARNING)

# --------- MAIN ---------
if __name__ == "__main__":
    setup_logging()
    
    print("=" * 60)
    print("🚀 SOCIAL MEDIA DRUG DETECTOR API (ENHANCED)")
    print("=" * 60)
    print(f"📸 Instagram: Auto-detection with embeddings")
    print(f"📱 Telegram: Sentence Transformer embeddings + LLM analysis")
    print(f"💬 WhatsApp: Sentence Transformer + LLM analysis")
    print(f"🤖 AI Model: {GROQ_MODEL}")
    print(f"🔧 Enhanced Error Handling: Active")
    print(f"🔧 PyTorch Meta Tensor Fix: Applied")
    print(f"🔧 JSON Auto-Fix: Enabled")
    print(f"📝 Logging: Configured to logs/app.log")
    print(f"🔗 Endpoints:")
    print(f"   GET  http://127.0.0.1:8000/")
    print(f"   GET  http://127.0.0.1:8000/health")
    print(f"   POST http://127.0.0.1:8000/api/analyze (Instagram)")
    print(f"   POST http://127.0.0.1:8000/api/analyze/telegram (Telegram)")
    print(f"   POST http://127.0.0.1:8000/api/analyze/whatsapp (WhatsApp)")
    print("=" * 60)
    print("💡 Features:")
    print("   • Robust JSON extraction from LLM responses")
    print("   • Automatic JSON formatting fixes")
    print("   • PyTorch meta tensor error fix")
    print("   • Custom error handling for different error types")
    print("   • Enhanced logging and debugging")
    print("   • Graceful fallback mechanisms")
    print("   • Request tracking with unique IDs")
    print("=" * 60)
    print("⚙️  Note: Using CPU-only mode to avoid PyTorch meta tensor issues")
    print("=" * 60)
    
    app.run(host="127.0.0.1", port=8000, debug=False, threaded=True)