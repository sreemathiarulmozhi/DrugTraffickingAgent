"""
Instagram scraper module
"""
import os
import time
import re
from playwright.sync_api import sync_playwright

class InstagramScraper:
    """Instagram content extractor"""
    
    def __init__(self):
        self.max_comments = 5
        self.timeout = 10000
    
    async def extract_post_content(self, url: str):
        """Extract caption and comments from Instagram post"""
        start_time = time.time()
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-dev-shm-usage']
                )
                
                page = browser.new_page()
                page.set_default_timeout(self.timeout)
                
                # Go to URL
                page.goto(url, wait_until="domcontentloaded")
                
                # Get caption
                caption_text = ""
                try:
                    meta_desc = page.query_selector("meta[property='og:description']")
                    if meta_desc:
                        caption_text = meta_desc.get_attribute("content") or ""
                except:
                    pass
                
                # Get comments
                comments = []
                try:
                    comment_elements = page.query_selector_all("span")
                    for elem in comment_elements[:30]:
                        text = elem.inner_text().strip()
                        if (text and 10 < len(text) < 200 and
                            text not in caption_text and
                            not text.startswith("@") and
                            "like" not in text.lower() and
                            "view" not in text.lower()):
                            comments.append(text)
                            if len(comments) >= self.max_comments:
                                break
                except:
                    pass
                
                browser.close()
                
                elapsed = time.time() - start_time
                
                # Prepare result
                comments_text = "\n".join(comments[:self.max_comments]) if comments else ""
                
                return {
                    "url": url,
                    "caption": caption_text[:300] if caption_text else "",
                    "comments": comments,
                    "comments_text": comments_text,
                    "comments_count": len(comments),
                    "extraction_time": elapsed,
                    "has_media": True
                }
                
        except Exception as e:
            print(f"❌ Instagram extraction error: {str(e)[:100]}")
            return {
                "url": url,
                "caption": "",
                "comments": [],
                "comments_text": "",
                "comments_count": 0,
                "error": str(e),
                "extraction_time": 0
            }