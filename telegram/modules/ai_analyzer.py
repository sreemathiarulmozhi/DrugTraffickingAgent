"""
AI Analyzer using Llama3 via Groq - BATCH VERSION
"""
import os
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    logging.warning("Groq library not installed. AI analysis will be basic.")

class AIAnalyzer:
    """AI analysis for drug content detection - BATCH PROCESSING"""
    
    def __init__(self):
        self.groq_client = None
        
        if GROQ_AVAILABLE and os.getenv('GROQ_API_KEY'):
            try:
                self.groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))
                logging.info("✅ Groq client initialized (Llama3)")
            except Exception as e:
                logging.error(f"Failed to initialize Groq: {e}")
                self.groq_client = None
        else:
            logging.warning("⚠️ Using basic keyword analysis (no Groq API)")
        
        # Cache to avoid duplicate analysis
        self.analyzed_cache = {}
        
        # Drug keywords for basic analysis
        self.drug_keywords = [
            'weed', 'marijuana', 'cocaine', 'heroin', 'meth', 'mdma',
            'ecstasy', 'lsd', 'acid', 'shrooms', 'xanax', 'oxy', 'adderall',
            'fentanyl', 'ketamine', 'dmt', 'pharma', 'pill', 'meds',
            'prescription', 'opioid', 'amphetamine', 'benzodiazepine'
        ]
        
        self.transaction_patterns = [
            'dm for', 'contact for', 'for sale', 'price', 'delivery',
            'available now', 'in stock', 'shipping', 'discreet',
            'cash only', 'bitcoin', 'crypto', 'escrow'
        ]
    
    async def analyze_messages_batch(self, messages: List[Dict], channel: str = "") -> List[Dict]:
        """Analyze multiple messages in one batch"""
        
        if not messages:
            return []
        
        print(f"🤖 Analyzing {len(messages)} messages from {channel}...")
        
        if self.groq_client:
            # Try batch analysis with Llama3
            batch_result = await self._analyze_batch_with_llama3(messages, channel)
            if batch_result:
                return batch_result
        
        # Fallback to individual keyword analysis
        return [self._analyze_with_keywords(msg, channel) for msg in messages]
    
    async def _analyze_batch_with_llama3(self, messages: List[Dict], channel: str) -> Optional[List[Dict]]:
        """Batch analyze messages with Llama3"""
        try:
            # Prepare batch data
            messages_text = []
            for i, msg in enumerate(messages[:20]):  # Limit to 20 messages per batch
                text = msg.get('text', '')
                if text and len(text) > 10:  # Only analyze meaningful messages
                    messages_text.append({
                        'id': i,
                        'text': text[:300]  # Truncate long messages
                    })
            
            if not messages_text:
                return []
            
            # Create prompt for batch analysis
            prompt = self._create_batch_prompt(messages_text, channel)
            
            # Call Groq API
            completion = self.groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=2000,
                response_format={"type": "json_object"}  # Request JSON response
            )
            
            response = completion.choices[0].message.content
            
            # Parse JSON response
            try:
                result = json.loads(response)
                analyses = result.get('analyses', [])
                
                # Map analyses back to original messages
                results = []
                for i, msg in enumerate(messages[:len(analyses)]):
                    analysis = analyses[i] if i < len(analyses) else {}
                    
                    results.append({
                        'message_id': msg.get('id'),
                        'channel': channel,
                        'text': msg.get('text', '')[:200],
                        'date': msg.get('date', datetime.now().isoformat()),
                        'risk_level': analysis.get('risk_level', 'unknown'),
                        'confidence': float(analysis.get('confidence', 0)),
                        'indicators': analysis.get('indicators', []),
                        'summary': analysis.get('summary', 'No summary'),
                        'action': analysis.get('action', 'No action'),
                        'ai_model': 'Llama3-Batch'
                    })
                
                print(f"✅ Batch analysis complete: {len(results)} messages analyzed")
                return results
                
            except json.JSONDecodeError:
                print("⚠️  Failed to parse JSON response, using keyword analysis")
                return None
                
        except Exception as e:
            print(f"⚠️  Batch analysis error: {e}")
            return None
    
    def _create_batch_prompt(self, messages: List[Dict], channel: str) -> str:
        """Create prompt for batch analysis"""
        messages_json = json.dumps(messages, indent=2)
        
        return f"""
        Analyze these Telegram messages for drug trafficking activity.
        
        CHANNEL: {channel}
        MESSAGES: {messages_json}
        
        For EACH message, provide:
        1. risk_level: "high", "medium", "low", or "safe"
        2. confidence: 0.0 to 1.0
        3. indicators: list of drug-related indicators found
        4. summary: brief analysis (20 words max)
        5. action: recommended action
        
        Return ONLY a JSON object with this structure:
        {{
          "analyses": [
            {{
              "risk_level": "high",
              "confidence": 0.9,
              "indicators": ["cocaine", "for sale"],
              "summary": "Message offers cocaine for sale",
              "action": "IMMEDIATE REVIEW - drug trafficking"
            }},
            // ... more analyses
          ]
        }}
        """
    
    def _get_system_prompt(self) -> str:
        """Get system prompt for drug detection"""
        return """You are an expert drug trafficking detection system. 
        Analyze Telegram messages for signs of drug trafficking, including:
        
        1. DRUG NAMES: cocaine, heroin, meth, MDMA, weed, marijuana, xanax, oxy, fentanyl, etc.
        2. CODED TERMS: snow, candy, bars, green, fire, work, pack, gear
        3. TRANSACTION PATTERNS: "dm for", "for sale", "price", "delivery", "shipping"
        4. PAYMENT METHODS: "bitcoin", "crypto", "cash only"
        5. SAFETY TERMS: "discreet", "secure", "escrow"
        
        Classify risk levels:
        - HIGH: Direct drug names + transaction terms (e.g., "cocaine for sale")
        - MEDIUM: Drug names OR transaction terms (e.g., "contact for party supplies")
        - LOW: Suspicious but unclear (e.g., "good stuff available")
        - SAFE: No drug indicators
        
        Be accurate and conservative. False positives are better than missing real trafficking."""
    
    def _analyze_with_keywords(self, message: Dict, channel: str) -> Dict:
        """Basic keyword analysis for a single message"""
        text = message.get('text', '').lower()
        
        # Check for keywords
        found_drugs = [kw for kw in self.drug_keywords if kw in text]
        found_patterns = [p for p in self.transaction_patterns if p in text]
        
        # Check for payment methods
        payment_terms = ['bitcoin', 'crypto', 'cash', 'paypal', 'venmo']
        found_payments = [p for p in payment_terms if p in text]
        
        # Calculate risk score
        risk_score = (
            len(found_drugs) * 3 +
            len(found_patterns) * 2 +
            len(found_payments) * 1
        )
        
        # Determine risk level
        if risk_score >= 5:
            risk_level = 'high'
            confidence = 0.8
        elif risk_score >= 2:
            risk_level = 'medium'
            confidence = 0.6
        else:
            risk_level = 'low'
            confidence = 0.2
        
        # Create indicators list
        indicators = []
        if found_drugs:
            indicators.append(f"drugs: {', '.join(found_drugs)}")
        if found_patterns:
            indicators.append(f"transactions: {', '.join(found_patterns)}")
        if found_payments:
            indicators.append(f"payments: {', '.join(found_payments)}")
        
        return {
            'message_id': message.get('id'),
            'channel': channel,
            'text': message.get('text', '')[:200],
            'date': message.get('date', datetime.now().isoformat()),
            'risk_level': risk_level,
            'confidence': confidence,
            'indicators': indicators,
            'summary': f"Found {len(found_drugs)} drug terms, {len(found_patterns)} transaction patterns",
            'action': self._get_action(risk_level),
            'ai_model': 'Keyword Analysis'
        }
    
    def _get_action(self, risk_level: str) -> str:
        """Get recommended action"""
        actions = {
            'high': '🚨 IMMEDIATE REVIEW - High probability of drug trafficking',
            'medium': '⚠️ MONITOR CLOSELY - Suspicious activity detected',
            'low': '👀 KEEP WATCH - Some suspicious indicators',
            'safe': '✅ ROUTINE MONITORING - No significant risk'
        }
        return actions.get(risk_level, 'No action required')
    
    async def analyze_single_message(self, text: str, channel: str = "") -> Dict:
        """Analyze single message (for API)"""
        message = {'text': text, 'id': 'single', 'date': datetime.now().isoformat()}
        results = await self.analyze_messages_batch([message], channel)
        return results[0] if results else self._analyze_with_keywords(message, channel)