"""
Telegram Monitoring Agent - Pure Agent Version
Updated for real integration only
"""
import os
import sys
import asyncio
import json
import logging
from datetime import datetime
import time

# Add current directory to path to import modules
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

try:
    from modules.channel_discovery import ChannelDiscoverer
    from modules.telegram_client import TelegramMonitorClient    
    from modules.ai_analyzer import AIAnalyzer
    print("✅ All modules imported successfully")
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("📋 Checking module paths...")
    
    # Try alternative import paths
    try:
        sys.path.append(os.path.join(current_dir, 'modules'))
        from channel_discovery import ChannelDiscoverer
        from telegram_client import TelegramMonitorClient    
        from ai_analyzer import AIAnalyzer
        print("✅ Modules imported after path adjustment")
    except ImportError as e2:
        print(f"❌ Still cannot import modules: {e2}")
        print("💡 Make sure modules directory exists with required files")
        raise

class TelegramMonitorAgent:
    """Pure Telegram monitoring agent - REAL AGENT ONLY"""
    
    def __init__(self):
        self.is_running = False
        self.telegram = None
        self.discoverer = None
        self.ai_analyzer = None
        self.monitored_channels = []
        self.analysis_results = []
        self.cycle_count = 0
        self.total_messages_scanned = 0
        self.total_alerts_found = 0
        self.setup_logging()
    
    def setup_logging(self):
        """Setup logging"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - TelegramAgent - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('telegram_agent.log', encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
    
    async def initialize(self):
        """Initialize the agent"""
        logging.info("🤖 Initializing REAL Telegram Monitor Agent...")
        print("="*60)
        print("🤖 REAL TELEGRAM AGENT INITIALIZATION")
        print("="*60)
        
        try:
            self.telegram = TelegramMonitorClient()
            self.ai_analyzer = AIAnalyzer()
            
            # Connect to Telegram
            print("📞 Connecting to Telegram...")
            if not await self.telegram.connect():
                logging.error("Failed to connect to Telegram")
                print("❌ Failed to connect to Telegram")
                print("💡 Check your .env file and Telegram credentials")
                return False
            
            self.discoverer = ChannelDiscoverer(self.telegram)
            
            # Load monitored channels
            await self.load_channels()
            
            if not self.monitored_channels:
                print("📝 Adding default public channels for monitoring...")
                self.monitored_channels = ["durov", "telegram", "tginfo"]
                await self.save_channels()
            
            print("="*60)
            print(f"✅ Telegram agent initialized successfully")
            print(f"📊 Will monitor {len(self.monitored_channels)} channels")
            print(f"🤖 AI Model: {'Llama3 via Groq' if hasattr(self.ai_analyzer, 'groq_client') and self.ai_analyzer.groq_client else 'Keyword Analysis'}")
            print("="*60)
            
            logging.info(f"Agent initialized. Monitoring {len(self.monitored_channels)} channels")
            return True
            
        except Exception as e:
            logging.error(f"Agent initialization failed: {e}")
            print(f"❌ Agent initialization failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def load_channels(self):
        """Load monitored channels"""
        try:
            if os.path.exists('channels.json'):
                with open('channels.json', 'r') as f:
                    data = json.load(f)
                    self.monitored_channels = data.get('channels', [])
                print(f"📁 Loaded {len(self.monitored_channels)} channels from storage")
        except Exception as e:
            print(f"⚠️  Could not load channels: {e}")
            self.monitored_channels = []
    
    async def save_channels(self):
        """Save monitored channels"""
        try:
            with open('channels.json', 'w') as f:
                json.dump({'channels': self.monitored_channels}, f, indent=2)
        except Exception as e:
            print(f"❌ Error saving channels: {e}")
    
    async def run(self):
        """Main agent loop - REAL MONITORING ONLY"""
        self.is_running = True
        
        print("\n" + "="*60)
        print("🚀 REAL TELEGRAM AGENT STARTED - LIVE MONITORING")
        print("="*60)
        logging.info("Telegram agent started - live monitoring")
        
        self.cycle_count = 0
        
        try:
            while self.is_running:
                self.cycle_count += 1
                
                print(f"\n🔄 Monitoring cycle #{self.cycle_count}")
                print(f"📡 Active channels: {len(self.monitored_channels)}")
                print(f"📊 Stats: {self.total_messages_scanned} messages scanned, {self.total_alerts_found} alerts found")
                print("-" * 40)
                
                # Scan each channel
                for i, channel in enumerate(self.monitored_channels[:15]):  # Limit to 15 channels
                    if not self.is_running:
                        break
                        
                    print(f"  [{i+1}/{min(15, len(self.monitored_channels))}] Scanning: {channel}")
                    await self.scan_channel(channel)
                
                # Save results
                await self.save_results()
                
                print(f"\n✅ Cycle #{self.cycle_count} complete.")
                print(f"📈 Total scanned: {self.total_messages_scanned} messages")
                print(f"🚨 Total alerts: {self.total_alerts_found}")
                print(f"⏰ Next cycle in 60 seconds...")
                
                # Log cycle completion
                logging.info(f"Cycle #{self.cycle_count} complete. Total alerts: {self.total_alerts_found}")
                
                # Wait before next cycle (with check for stop)
                for _ in range(60):
                    if not self.is_running:
                        break
                    await asyncio.sleep(1)
                
        except KeyboardInterrupt:
            print("\n🛑 Agent stopped by user")
            logging.info("Agent stopped by user")
        except Exception as e:
            print(f"❌ Agent error: {e}")
            logging.error(f"Agent error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await self.shutdown()
    
    async def scan_channel(self, channel_name):
        """Scan a channel for drug content - REAL SCANNING"""
        try:
            # Fetch messages
            messages = await self.telegram.fetch_messages(channel_name, limit=25)
            
            if not messages:
                print(f"    ℹ️  No messages in {channel_name}")
                return
            
            self.total_messages_scanned += len(messages)
            print(f"    📄 Found {len(messages)} messages in {channel_name}")
            
            # Analyze messages with AI
            analyses = await self.ai_analyzer.analyze_messages_batch(messages, channel_name)
            
            # Process results
            high_risk_count = 0
            medium_risk_count = 0
            
            for analysis in analyses:
                if analysis['risk_level'] != 'low':
                    self.analysis_results.append({
                        **analysis,
                        'timestamp': datetime.now().isoformat(),
                        'agent_cycle': self.cycle_count,
                        'scan_id': f"scan_{self.cycle_count}_{channel_name}"
                    })
                    
                    if analysis['risk_level'] == 'high':
                        high_risk_count += 1
                        self.total_alerts_found += 1
                        print(f"    🚨 HIGH RISK: {analysis['summary'][:80]}")
                        logging.warning(f"High risk in {channel_name}: {analysis['summary']}")
                        
                        # Log to system (would be picked up by main app)
                        self._log_alert_to_system(analysis)
                        
                    elif analysis['risk_level'] == 'medium':
                        medium_risk_count += 1
                        print(f"    ⚠️  Medium risk: {analysis['summary'][:80]}")
                        logging.info(f"Medium risk in {channel_name}: {analysis['summary']}")
            
            if high_risk_count > 0 or medium_risk_count > 0:
                print(f"    🎯 Summary: {high_risk_count} high, {medium_risk_count} medium risks")
            
        except Exception as e:
            print(f"    ⚠️  Error scanning {channel_name}: {e}")
            logging.error(f"Error scanning {channel_name}: {e}")
    
    def _log_alert_to_system(self, analysis):
        """Log alert to system file for main app to pick up"""
        try:
            alert_data = {
                'timestamp': datetime.now().isoformat(),
                'source': 'telegram',
                'channel': analysis['channel'],
                'risk_level': analysis['risk_level'],
                'message': analysis['summary'],
                'confidence': analysis['confidence'],
                'ai_model': analysis.get('ai_model', 'Llama3'),
                'full_text': analysis['text'][:500],
                'indicators': analysis.get('indicators', []),
                'agent_cycle': self.cycle_count
            }
            
            # Append to alerts file
            alerts_file = 'telegram_alerts.json'
            try:
                with open(alerts_file, 'r') as f:
                    existing = json.load(f)
            except:
                existing = {'alerts': []}
            
            existing['alerts'].append(alert_data)
            
            # Keep only last 50 alerts
            if len(existing['alerts']) > 50:
                existing['alerts'] = existing['alerts'][-50:]
            
            with open(alerts_file, 'w') as f:
                json.dump(existing, f, indent=2)
                
        except Exception as e:
            print(f"    ⚠️  Error logging alert: {e}")
    
    async def save_results(self):
        """Save analysis results"""
        try:
            results_file = 'telegram_agent_results.json'
            data = {
                'timestamp': datetime.now().isoformat(),
                'cycle': self.cycle_count,
                'channels_monitored': len(self.monitored_channels),
                'total_messages_scanned': self.total_messages_scanned,
                'total_alerts_found': self.total_alerts_found,
                'monitored_channels': self.monitored_channels,
                'last_scan_time': datetime.now().isoformat(),
                'agent_status': 'running' if self.is_running else 'stopped'
            }
            
            with open(results_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            print(f"    💾 Saved agent results to {results_file}")
            
        except Exception as e:
            print(f"    ❌ Error saving results: {e}")
            logging.error(f"Error saving results: {e}")
    
    async def shutdown(self):
        """Shutdown the agent"""
        self.is_running = False
        if self.telegram:
            await self.telegram.disconnect()
        
        print("\n" + "="*60)
        print("👋 Telegram agent shutdown complete")
        print(f"📊 Final stats: {self.total_messages_scanned} messages scanned, {self.total_alerts_found} alerts found")
        print("="*60)
        logging.info(f"Telegram agent shutdown. Total alerts: {self.total_alerts_found}")


async def main():
    """Agent entry point"""
    agent = TelegramMonitorAgent()
    
    if not await agent.initialize():
        print("❌ Agent initialization failed. Exiting.")
        return
    
    await agent.run()

if __name__ == "__main__":
    # Windows compatibility
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    print("\n" + "="*60)
    print("🤖 Telegram Monitoring Agent - Standalone Mode")
    print("="*60)
    print("Note: For best experience, run through the main app.py")
    print("      This will provide web interface and unified dashboard")
    print("="*60 + "\n")
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Agent terminated by user")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")