"""
Nexus AI - Complete Monitoring System with Real Agent Logging
Uses separate telegram_agent.py file
"""
import os
import sys
import json
import sqlite3
import threading
import subprocess
import time
import random
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import logging

# ==============================================
# Initial Setup
# ==============================================
if sys.platform == "win32":
    os.system("chcp 65001 > nul")
    sys.stdout.reconfigure(encoding='utf-8')

def load_env_file():
    """Load environment variables"""
    env_path = Path('.env')
    if not env_path.exists():
        print("❌ .env file not found!")
        return False
    
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip().strip('"\'')
        return True
    except Exception as e:
        print(f"❌ Error loading .env: {e}")
        return False

print("\n" + "="*60)
print("🚀 NEXUS AI - Complete Monitoring System")
print("="*60)

if not load_env_file():
    print("\n❌ Failed to load .env")
    exit(1)

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# ==============================================
# Database Manager
# ==============================================
class DatabaseManager:
    """SQLite database for persistent storage"""
    
    def __init__(self, db_path='nexus_monitoring.db'):
        self.db_path = db_path
        self.init_database()
        self.add_sample_data()
    
    def init_database(self):
        """Create database tables"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Alerts table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    source TEXT NOT NULL,
                    channel TEXT,
                    risk_level TEXT CHECK(risk_level IN ('high', 'medium', 'low')),
                    message TEXT,
                    confidence REAL,
                    ai_model TEXT,
                    processed BOOLEAN DEFAULT 0
                )
            ''')
            
            # Agent logs table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS agent_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    agent_id TEXT,
                    log_type TEXT,
                    message TEXT,
                    details TEXT
                )
            ''')
            
            # Agents table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    status TEXT DEFAULT 'stopped',
                    last_started DATETIME,
                    last_stopped DATETIME,
                    total_alerts INTEGER DEFAULT 0,
                    channels_monitored INTEGER DEFAULT 0,
                    messages_analyzed INTEGER DEFAULT 0,
                    last_activity DATETIME
                )
            ''')
            
            # Initialize default agents
            default_agents = [
                ('telegram', 'Telegram Monitor', 'stopped', None, None, 0, 0, 0, None),
                ('facebook', 'Facebook Monitor', 'stopped', None, None, 0, 0, 0, None),
                ('reddit', 'Reddit Monitor', 'stopped', None, None, 0, 0, 0, None)
            ]
            
            cursor.executemany('''
                INSERT OR IGNORE INTO agents (id, name, status, last_started, last_stopped, total_alerts, channels_monitored, messages_analyzed, last_activity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', default_agents)
            
            conn.commit()
        print("✅ Database initialized")
    
    def add_sample_data(self):
        """Add sample alerts if database is empty"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM alerts")
            if cursor.fetchone()[0] == 0:
                sample_alerts = [
                    (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'telegram', '@darkmarket', 'high', 
                     'Looking for bulk cocaine delivery. Contact @dealer123 for prices.', 95.0, 'Llama3'),
                    (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'facebook', 'Private Group: Pharma Deals', 'high',
                     'Xanax bars available, shipping worldwide. Discreet packaging.', 92.0, 'Llama3'),
                    (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'reddit', 'r/darknet', 'medium',
                     'Discussion about Bitcoin payments for special deliveries.', 78.0, 'Llama3'),
                ]
                
                cursor.executemany('''
                    INSERT INTO alerts (timestamp, source, channel, risk_level, message, confidence, ai_model)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', sample_alerts)
                
                conn.commit()
                print("✅ Added sample alerts to database")
    
    def add_alert(self, source, channel, risk_level, message, confidence, ai_model):
        """Add new alert"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO alerts (source, channel, risk_level, message, confidence, ai_model)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (source, channel, risk_level, message, confidence, ai_model))
            
            alert_id = cursor.lastrowid
            
            # Update agent stats
            cursor.execute('''
                UPDATE agents 
                SET total_alerts = total_alerts + 1,
                    last_activity = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (source,))
            
            conn.commit()
            return alert_id
    
    def add_agent_log(self, agent_id, log_type, message, details=None):
        """Add agent activity log"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO agent_logs (agent_id, log_type, message, details)
                VALUES (?, ?, ?, ?)
            ''', (agent_id, log_type, message, details))
            
            # Update agent last activity
            cursor.execute('''
                UPDATE agents 
                SET last_activity = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (agent_id,))
            
            conn.commit()
            
            # Print to console with color coding
            colors = {
                'start': '🟢',
                'stop': '🔴',
                'scan': '🔍',
                'alert': '🚨',
                'info': 'ℹ️',
                'error': '❌'
            }
            emoji = colors.get(log_type, '📝')
            print(f"{emoji} [{agent_id.upper()}] {message}")
            if details:
                print(f"   📋 Details: {details}")
    
    def get_agent_logs(self, agent_id=None, limit=20):
        """Get agent activity logs"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            if agent_id:
                cursor.execute('''
                    SELECT timestamp, agent_id, log_type, message, details
                    FROM agent_logs 
                    WHERE agent_id = ?
                    ORDER BY timestamp DESC 
                    LIMIT ?
                ''', (agent_id, limit))
            else:
                cursor.execute('''
                    SELECT timestamp, agent_id, log_type, message, details
                    FROM agent_logs 
                    ORDER BY timestamp DESC 
                    LIMIT ?
                ''', (limit,))
            
            return [
                {
                    'timestamp': row[0],
                    'agent_id': row[1],
                    'log_type': row[2],
                    'message': row[3],
                    'details': row[4]
                }
                for row in cursor.fetchall()
            ]
    
    def get_alerts(self, source='all', limit=20):
        """Get alerts with optional filtering"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            if source == 'all':
                cursor.execute('''
                    SELECT id, timestamp, source, channel, risk_level, message, confidence, ai_model
                    FROM alerts 
                    ORDER BY timestamp DESC 
                    LIMIT ?
                ''', (limit,))
            else:
                cursor.execute('''
                    SELECT id, timestamp, source, channel, risk_level, message, confidence, ai_model
                    FROM alerts 
                    WHERE source = ?
                    ORDER BY timestamp DESC 
                    LIMIT ?
                ''', (source, limit))
            
            return [
                {
                    'id': row[0],
                    'timestamp': row[1],
                    'source': row[2],
                    'channel': row[3],
                    'risk_level': row[4],
                    'message': row[5],
                    'confidence': row[6],
                    'ai_model': row[7]
                }
                for row in cursor.fetchall()
            ]
    
    def get_stats(self):
        """Get system statistics"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Total alerts
            cursor.execute("SELECT COUNT(*) FROM alerts")
            total_alerts = cursor.fetchone()[0]
            
            # High risk alerts
            cursor.execute("SELECT COUNT(*) FROM alerts WHERE risk_level = 'high'")
            high_risk = cursor.fetchone()[0]
            
            # Agent counts
            cursor.execute("SELECT SUM(channels_monitored), SUM(messages_analyzed) FROM agents")
            channels, messages = cursor.fetchone()
            
            # Recent activity
            cursor.execute("SELECT COUNT(*) FROM agent_logs WHERE timestamp > datetime('now', '-5 minutes')")
            recent_activity = cursor.fetchone()[0]
            
            return {
                'total_alerts': total_alerts or 0,
                'high_risk_alerts': high_risk or 0,
                'channels_monitored': channels or 0,
                'messages_analyzed': messages or 0,
                'recent_activity': recent_activity or 0
            }
    
    def get_agents(self):
        """Get all agents"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM agents")
            
            agents = {}
            for row in cursor.fetchall():
                agents[row[0]] = {
                    'name': row[1],
                    'status': row[2],
                    'last_started': row[3],
                    'last_stopped': row[4],
                    'total_alerts': row[5],
                    'channels_monitored': row[6],
                    'messages_analyzed': row[7],
                    'last_activity': row[8]
                }
            return agents
    
    def update_agent_status(self, agent_id, status):
        """Update agent status"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            if status == 'running':
                cursor.execute('''
                    UPDATE agents 
                    SET status = ?, last_started = CURRENT_TIMESTAMP,
                        last_activity = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (status, agent_id))
            else:
                cursor.execute('''
                    UPDATE agents 
                    SET status = ?, last_stopped = CURRENT_TIMESTAMP,
                        last_activity = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (status, agent_id))
            
            conn.commit()

# ==============================================
# Agent Manager (REAL TELEGRAM ONLY)
# ==============================================
class AgentManager:
    """Manages all monitoring agents - REAL Telegram + Simulation for others"""
    
    def __init__(self, db_manager):
        self.db = db_manager
        self.agents = {}
        self.simulation_agents = {}  # For Facebook and Reddit
        self.telegram_agent_instance = None
        self.telegram_agent_thread = None
        self.setup_logging()
        print("🤖 Agent Manager initialized (Real Telegram + Simulation for others)")
    
    def setup_logging(self):
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('agent_system.log', encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
    
    def start_agent(self, agent_id):
        """Start an agent - Real Telegram or Simulation for others"""
        if agent_id not in ['telegram', 'facebook', 'reddit']:
            return {'success': False, 'message': 'Invalid agent'}
        
        # Check if already running
        agents = self.db.get_agents()
        if agents.get(agent_id, {}).get('status') == 'running':
            return {'success': False, 'message': 'Agent already running'}
        
        print(f"\n{'='*60}")
        print(f"🚀 STARTING {agent_id.upper()} AGENT")
        print(f"{'='*60}")
        
        try:
            # Log agent start
            self.db.add_agent_log(agent_id, 'start', f'Starting {agent_id} agent')
            
            if agent_id == 'telegram':
                # Start REAL Telegram agent
                return self._start_real_telegram_agent()
            else:
                # Start simulation agent for Facebook/Reddit
                return self._start_simulation_agent(agent_id)
            
        except Exception as e:
            error_msg = f'Failed to start agent: {str(e)}'
            self.db.add_agent_log(agent_id, 'error', error_msg)
            return {'success': False, 'message': error_msg}
    
    def _start_real_telegram_agent(self):
        """Start the real Telegram agent with proper error handling"""
        try:
            print("🤖 Attempting to start REAL Telegram agent...")
            
            # Check if telegram_agent.py exists
            if not os.path.exists('telegram_agent.py'):
                error_msg = "telegram_agent.py not found!"
                print(f"❌ {error_msg}")
                self.db.add_agent_log('telegram', 'error', error_msg, 'Create telegram_agent.py file')
                return {'success': False, 'message': 'Telegram agent file not found'}
            
            try:
                # Clear any previous import
                if 'telegram_agent' in sys.modules:
                    del sys.modules['telegram_agent']
                
                from telegram_agent import TelegramMonitorAgent
                print("✅ Telegram agent module imported successfully")
            except ImportError as e:
                error_msg = f"Failed to import telegram_agent: {str(e)}"
                print(f"❌ {error_msg}")
                self.db.add_agent_log('telegram', 'error', error_msg)
                return {'success': False, 'message': f'Import error: {str(e)}'}
            
            # Create agent instance
            self.telegram_agent_instance = TelegramMonitorAgent()
            print("✅ Telegram agent instance created")
            
            # Create and start agent thread
            self.telegram_agent_thread = threading.Thread(
                target=self._run_telegram_agent,
                daemon=True
            )
            
            self.agents['telegram'] = {
                'thread': self.telegram_agent_thread,
                'running': True,
                'instance': self.telegram_agent_instance,
                'is_simulation': False
            }
            
            self.telegram_agent_thread.start()
            
            # Wait a bit to see if initialization succeeds
            time.sleep(3)
            
            # Check if initialization was successful
            if not self.agents['telegram'].get('running', False):
                error_msg = "Agent failed to initialize"
                print(f"❌ {error_msg}")
                self.db.add_agent_log('telegram', 'error', error_msg)
                return {'success': False, 'message': 'Agent failed to initialize'}
            
            # Update database status
            self.db.update_agent_status('telegram', 'running')
            
            self.db.add_agent_log('telegram', 'start', 'Real Telegram agent started successfully', 'Using actual Telegram API with Llama3 AI')
            
            return {'success': True, 'message': 'Real Telegram agent started successfully'}
            
        except Exception as e:
            error_msg = f'Failed to start Telegram agent: {str(e)}'
            print(f"❌ {error_msg}")
            import traceback
            traceback.print_exc()
            
            self.db.add_agent_log('telegram', 'error', error_msg, str(e))
            
            return {'success': False, 'message': f'Failed to start: {str(e)}'}
    
    def _start_simulation_agent(self, agent_id):
        """Start simulation agent for Facebook or Reddit"""
        print(f"🤖 Starting SIMULATION agent for {agent_id}")
        
        # Create simulation thread
        sim_thread = threading.Thread(
            target=self._run_simulation_agent,
            args=(agent_id,),
            daemon=True
        )
        
        self.simulation_agents[agent_id] = {
            'thread': sim_thread,
            'running': True,
            'is_simulation': True
        }
        
        sim_thread.start()
        
        # Update database status
        self.db.update_agent_status(agent_id, 'running')
        
        # Initialize some channels monitored
        with sqlite3.connect(self.db.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE agents 
                SET channels_monitored = ?
                WHERE id = ?
            ''', (random.randint(2, 5), agent_id))
            conn.commit()
        
        self.db.add_agent_log(agent_id, 'start', f'Simulation agent started', 
                            f'Generating realistic simulation data for {agent_id}')
        
        return {'success': True, 'message': f'Simulation agent for {agent_id} started'}
    
    def _run_simulation_agent(self, agent_id):
        """Run simulation agent to generate realistic data"""
        print(f"🎮 Simulation agent {agent_id} running...")
        
        # Simulation configuration
        sim_config = {
            'facebook': {
                'platform': 'Facebook',
                'channels': [
                    'Private Group: Pharma Deals',
                    'Page: Party Supplies',
                    'Marketplace: Suspicious Listings',
                    'Group: Anonymous Transactions'
                ],
                'keywords': ['drugs', 'cocaine', 'xanax', 'mdma', 'pharma', 'delivery', 'discreet'],
                'user_patterns': ['dealer', 'supplier', 'vendor', 'distributor']
            },
            'reddit': {
                'platform': 'Reddit',
                'channels': [
                    'r/darknet',
                    'r/drugs',
                    'r/RCsources',
                    'r/researchchemicals'
                ],
                'keywords': ['vendor', 'ship', 'tracking', 'encrypted', 'bitcoin', 'escrow'],
                'user_patterns': ['throwaway', 'anon', 'temp', 'burner']
            }
        }
        
        config = sim_config.get(agent_id, {})
        
        try:
            while self.simulation_agents.get(agent_id, {}).get('running', False):
                # Random interval between 10-30 seconds
                time.sleep(random.randint(10, 30))
                
                # Sometimes generate an alert (30% chance)
                if random.random() < 0.3:
                    self._generate_simulation_alert(agent_id, config)
                
                # Sometimes generate info log
                if random.random() < 0.4:
                    self._generate_simulation_log(agent_id, config)
                
                # Update messages analyzed stats periodically
                if random.random() < 0.2:
                    self._update_simulation_stats(agent_id)
                    
        except Exception as e:
            print(f"❌ Simulation agent {agent_id} error: {e}")
    
    def _generate_simulation_alert(self, agent_id, config):
        """Generate a realistic simulation alert"""
        alert_templates = [
            f"Potential drug-related content detected: '{{keyword}}' mentioned",
            f"Suspicious user pattern detected: {{user}} appears to be a dealer",
            f"Discussion about illegal substance transactions",
            f"Request for bulk delivery of controlled substances",
            f"Coded language detected suggesting illegal activities"
        ]
        
        keyword = random.choice(config.get('keywords', []))
        user = random.choice(config.get('user_patterns', [])) + str(random.randint(100, 999))
        channel = random.choice(config.get('channels', []))
        template = random.choice(alert_templates)
        
        message = template.format(keyword=keyword, user=user)
        
        # Add to database
        alert_id = self.db.add_alert(
            source=agent_id,
            channel=channel,
            risk_level=random.choice(['low', 'medium', 'medium', 'high']),  # Weighted
            message=message,
            confidence=random.randint(60, 95),
            ai_model='Llama3-Simulation'
        )
        
        # Log it
        self.db.add_agent_log(agent_id, 'alert', f'Simulation alert generated: {message[:50]}...', 
                            f'Alert #{alert_id} in {channel}')
        
        # Update stats
        with sqlite3.connect(self.db.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE agents 
                SET messages_analyzed = messages_analyzed + 1,
                    last_activity = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (agent_id,))
            conn.commit()
    
    def _generate_simulation_log(self, agent_id, config):
        """Generate simulation activity log"""
        log_types = ['scan', 'info', 'monitor']
        log_type = random.choice(log_types)
        
        logs = {
            'scan': [
                f"Scanning {random.choice(config.get('channels', []))} for suspicious content",
                f"Analyzing recent posts in monitored {config.get('platform', 'platform')} channels",
                f"Performing keyword analysis on recent messages"
            ],
            'info': [
                f"Monitoring {random.randint(3, 8)} active channels",
                f"Processed {random.randint(50, 200)} messages in last hour",
                f"AI model analyzing patterns in user behavior"
            ],
            'monitor': [
                f"New user joined monitored channel: {random.choice(config.get('user_patterns', []))}",
                f"Channel activity level: {random.choice(['low', 'normal', 'high'])}",
                f"Updated monitoring filters for improved detection"
            ]
        }
        
        message = random.choice(logs.get(log_type, ['Simulation activity']))
        
        self.db.add_agent_log(agent_id, log_type, message)
    
    def _update_simulation_stats(self, agent_id):
        """Update simulation agent statistics"""
        with sqlite3.connect(self.db.db_path) as conn:
            cursor = conn.cursor()
            
            # Increment messages analyzed
            increment = random.randint(10, 50)
            cursor.execute('''
                UPDATE agents 
                SET messages_analyzed = messages_analyzed + ?,
                    last_activity = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (increment, agent_id))
            
            conn.commit()
    
    def _run_telegram_agent(self):
        """Run the actual Telegram agent"""
        try:
            print("🤖 REAL TELEGRAM AGENT STARTING...")
            self.db.add_agent_log('telegram', 'info', 'Real Telegram agent thread starting')
            
            # Create async loop for the agent
            import asyncio
            
            # Windows compatibility
            if sys.platform == "win32":
                asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
            
            # Create new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # Run agent
            agent = self.telegram_agent_instance
            
            async def run_agent():
                if await agent.initialize():
                    self.db.add_agent_log('telegram', 'info', 'Telegram agent initialized successfully', 'Connected to Telegram and AI services')
                    await agent.run()
                else:
                    self.db.add_agent_log('telegram', 'error', 'Failed to initialize Telegram agent', 'Check credentials and network connection')
            
            loop.run_until_complete(run_agent())
            
        except Exception as e:
            error_msg = f"Telegram agent error: {str(e)}"
            print(f"❌ {error_msg}")
            self.db.add_agent_log('telegram', 'error', error_msg)
            
            # Stop agent
            if 'telegram' in self.agents:
                self.agents['telegram']['running'] = False
    
    def stop_agent(self, agent_id):
        """Stop an agent"""
        print(f"\n{'='*60}")
        print(f"🛑 STOPPING {agent_id.upper()} AGENT")
        print(f"{'='*60}")
        
        if agent_id == 'telegram' and agent_id in self.agents:
            # Stop real Telegram agent
            self.agents[agent_id]['running'] = False
            if self.telegram_agent_instance:
                self.telegram_agent_instance.is_running = False
                
                # Try to disconnect Telegram
                try:
                    import asyncio
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    async def shutdown():
                        await self.telegram_agent_instance.shutdown()
                    
                    loop.run_until_complete(shutdown())
                except:
                    pass
                
            del self.agents[agent_id]
        
        elif agent_id in self.simulation_agents:
            # Stop simulation agent
            self.simulation_agents[agent_id]['running'] = False
            del self.simulation_agents[agent_id]
        
        # Update database status
        self.db.update_agent_status(agent_id, 'stopped')
        
        self.db.add_agent_log(agent_id, 'stop', 'Agent stopped successfully')
        
        return {'success': True, 'message': f'{agent_id} agent stopped'}
    
    def get_agent_status(self, agent_id):
        """Get detailed agent status"""
        if agent_id == 'telegram' and agent_id in self.agents:
            agent = self.agents[agent_id]
            return {
                'running': agent.get('running', False),
                'is_simulation': False,
                'has_instance': 'instance' in agent,
                'thread_alive': agent.get('thread', None) and agent['thread'].is_alive()
            }
        elif agent_id in self.simulation_agents:
            agent = self.simulation_agents[agent_id]
            return {
                'running': agent.get('running', False),
                'is_simulation': True,
                'thread_alive': agent.get('thread', None) and agent['thread'].is_alive()
            }
        return {'running': False, 'is_simulation': False}
    
    def get_telegram_channels(self):
        """Get channels from real Telegram agent"""
        try:
            if self.telegram_agent_instance:
                channels = self.telegram_agent_instance.monitored_channels
                return {
                    'channels': channels,
                    'count': len(channels),
                    'source': 'live_agent',
                    'timestamp': datetime.now().isoformat()
                }
            else:
                return {
                    'channels': [],
                    'count': 0,
                    'source': 'agent_not_running',
                    'message': 'Telegram agent is not running'
                }
        except Exception as e:
            return {
                'channels': [],
                'count': 0,
                'source': 'error',
                'error': str(e)
            }
    
    def get_simulation_channels(self, agent_id):
        """Get channels for simulation agents"""
        sim_channels = {
            'facebook': [
                'Private Group: Pharma Deals',
                'Page: Party Supplies',
                'Marketplace: Suspicious Listings',
                'Group: Anonymous Transactions',
                'Secret Buy/Sell Group'
            ],
            'reddit': [
                'r/darknet',
                'r/drugs',
                'r/RCsources',
                'r/researchchemicals',
                'r/DNMBusts'
            ]
        }
        
        return {
            'channels': sim_channels.get(agent_id, []),
            'count': len(sim_channels.get(agent_id, [])),
            'source': 'simulation',
            'timestamp': datetime.now().isoformat()
        }
    
    def add_test_alert(self, agent_id='telegram'):
        """Add a test alert"""
        try:
            # Create realistic test alert based on agent type
            if agent_id == 'telegram':
                channels = ['@test_channel', '@monitoring_test', '@ai_analysis_test']
                messages = [
                    "Test alert: Suspected drug trafficking activity detected",
                    "AI analysis indicates high risk content in monitored channel",
                    "Pattern matching found suspicious transaction terms"
                ]
            elif agent_id == 'facebook':
                channels = ['Private Group: Test Monitoring', 'Page: Test Alerts']
                messages = [
                    "Simulated Facebook alert: Suspicious marketplace listing detected",
                    "Potential drug-related content in private group",
                    "Coded language suggesting illegal transactions"
                ]
            else:  # reddit
                channels = ['r/test_monitoring', 'r/simulation_alerts']
                messages = [
                    "Reddit simulation: Suspicious vendor discussion detected",
                    "Potential sourcing of controlled substances",
                    "Discussion about illegal marketplace activities"
                ]
            
            channel = random.choice(channels)
            message = random.choice(messages)
            
            alert_id = self.db.add_alert(
                source=agent_id,
                channel=channel,
                risk_level='high',
                message=message,
                confidence=random.randint(85, 95),
                ai_model='Llama3-Test'
            )
            
            self.db.add_agent_log(agent_id, 'alert', 'Test alert generated', 
                                f'Alert #{alert_id} - {message}')
            
            # Update agent stats
            with sqlite3.connect(self.db.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE agents 
                    SET total_alerts = total_alerts + 1,
                        last_activity = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (agent_id,))
                conn.commit()
            
            return {'success': True, 'alert_id': alert_id, 'message': f'Test alert #{alert_id} added'}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}


# ==============================================
# Initialize System
# ==============================================
db_manager = DatabaseManager()
agent_manager = AgentManager(db_manager)

# ==============================================
# Flask Routes
# ==============================================

@app.route('/')
def index():
    """Home page"""
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Dashboard page"""
    return render_template('dashboard.html')

@app.route('/dashboard.html')
def redirect_dashboard():
    """Redirect from old URL"""
    from flask import redirect
    return redirect('/dashboard')

@app.route('/favicon.ico')
def favicon():
    return '', 204

# Add to existing Flask routes in app.py

@app.route('/api/agent-info/<agent_id>')
def get_agent_info(agent_id):
    """Get detailed agent information"""
    agents = db_manager.get_agents()
    agent_data = agents.get(agent_id, {})
    
    # Get live status from agent manager
    live_status = agent_manager.get_agent_status(agent_id)
    
    # Determine agent type
    agent_type = 'real' if agent_id == 'telegram' and not live_status.get('is_simulation', True) else 'simulation'
    
    return jsonify({
        'id': agent_id,
        'name': agent_data.get('name', agent_id),
        'status': agent_data.get('status', 'stopped'),
        'agent_type': agent_type,
        'live_status': live_status,
        'stats': {
            'total_alerts': agent_data.get('total_alerts', 0),
            'channels_monitored': agent_data.get('channels_monitored', 0),
            'messages_analyzed': agent_data.get('messages_analyzed', 0),
            'last_activity': agent_data.get('last_activity'),
            'last_started': agent_data.get('last_started'),
            'last_stopped': agent_data.get('last_stopped')
        }
    })

@app.route('/api/agent-channels/<agent_id>')
def get_agent_channels(agent_id):
    """Get channels being monitored by agent"""
    try:
        # Try to get real channels from Telegram agent
        if agent_id == 'telegram' and agent_manager.telegram_agent_instance:
            channels = agent_manager.telegram_agent_instance.monitored_channels
            return jsonify({
                'channels': channels,
                'count': len(channels),
                'source': 'live_agent',
                'agent_type': 'real'
            })
        
        # Get simulation channels for Facebook/Reddit
        elif agent_id in ['facebook', 'reddit']:
            sim_data = agent_manager.get_simulation_channels(agent_id)
            return jsonify({
                **sim_data,
                'agent_type': 'simulation'
            })
        
        # Fallback
        return jsonify({
            'channels': [],
            'count': 0,
            'source': 'none',
            'agent_type': 'unknown'
        })
        
    except Exception as e:
        return jsonify({
            'channels': [],
            'count': 0,
            'source': 'error',
            'error': str(e)
        })
    

@app.route('/api/stats')
def get_stats():
    """Get system statistics"""
    stats = db_manager.get_stats()
    agents = db_manager.get_agents()
    
    running_agents = sum(1 for agent in agents.values() if agent['status'] == 'running')
    
    return jsonify({
        **stats,
        'running_agents': running_agents,
        'system_status': 'active',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/alerts')
def get_alerts():
    """Get alerts with filtering"""
    source = request.args.get('source', 'all')
    limit = int(request.args.get('limit', 20))
    
    alerts = db_manager.get_alerts(source=source, limit=limit)
    return jsonify({'alerts': alerts})

@app.route('/api/agents')
def get_agents():
    """Get all agents"""
    agents_data = db_manager.get_agents()
    
    agents_info = []
    for agent_id, data in agents_data.items():
        agents_info.append({
            'id': agent_id,
            'name': data['name'],
            'status': data['status'],
            'stats': {
                'total_alerts': data['total_alerts'],
                'channels_monitored': data['channels_monitored'],
                'messages_analyzed': data['messages_analyzed'],
                'last_activity': data['last_activity']
            }
        })
    
    return jsonify({'agents': agents_info})

@app.route('/api/agent-logs')
def get_agent_logs():
    """Get agent activity logs"""
    agent_id = request.args.get('agent_id')
    limit = int(request.args.get('limit', 50))
    
    logs = db_manager.get_agent_logs(agent_id=agent_id, limit=limit)
    return jsonify({'logs': logs})

@app.route('/api/agents/start', methods=['POST'])
def start_agent():
    """Start an agent"""
    data = request.json
    agent_id = data.get('agent_id', '').lower()
    
    if not agent_id:
        return jsonify({'success': False, 'message': 'No agent specified'}), 400
    
    result = agent_manager.start_agent(agent_id)
    return jsonify(result)

@app.route('/api/agents/stop', methods=['POST'])
def stop_agent():
    """Stop an agent"""
    data = request.json
    agent_id = data.get('agent_id', '').lower()
    
    if not agent_id:
        return jsonify({'success': False, 'message': 'No agent specified'}), 400
    
    result = agent_manager.stop_agent(agent_id)
    return jsonify(result)

@app.route('/api/agents/start-all', methods=['POST'])
def start_all_agents():
    """Start all agents"""
    results = {}
    for agent_id in ['telegram', 'facebook', 'reddit']:
        results[agent_id] = agent_manager.start_agent(agent_id)
    
    return jsonify({
        'success': True,
        'message': 'All agents starting',
        'results': results
    })

@app.route('/api/agents/stop-all', methods=['POST'])
def stop_all_agents():
    """Stop all agents"""
    results = {}
    for agent_id in ['telegram', 'facebook', 'reddit']:
        results[agent_id] = agent_manager.stop_agent(agent_id)
    
    return jsonify({
        'success': True,
        'message': 'All agents stopping',
        'results': results
    })

@app.route('/api/test-alert', methods=['POST'])
def test_alert():
    """Add a test alert"""
    data = request.json
    source = data.get('source', 'telegram')
    
    alert_id = db_manager.add_alert(
        source=source,
        channel='@test_channel',
        risk_level='high',
        message='Test alert generated by system',
        confidence=90.0,
        ai_model='Test'
    )
    
    db_manager.add_agent_log(source, 'alert', 'Test alert generated', f'Alert ID: {alert_id}')
    
    return jsonify({
        'success': True,
        'message': f'Test alert #{alert_id} added',
        'alert_id': alert_id
    })

@app.route('/health')
def health_check():
    """Health endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '3.0.0',
        'agents_running': len(agent_manager.agents)
    })

# ==============================================
# Main Execution
# ==============================================
if __name__ == '__main__':
    # Create directories
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    
    print("\n📋 System Status:")
    print("-" * 50)
    
    # Check database
    try:
        stats = db_manager.get_stats()
        print(f"✅ Database: nexus_monitoring.db")
        print(f"📊 Total alerts: {stats['total_alerts']}")
        print(f"📈 High risk alerts: {stats['high_risk_alerts']}")
    except Exception as e:
        print(f"❌ Database error: {e}")
    
    print("\n📁 Files Check:")
    print("-" * 50)
    
    # Check if telegram_agent.py exists
    if os.path.exists('telegram_agent.py'):
        print("✅ telegram_agent.py exists")
    else:
        print("⚠️  telegram_agent.py will be created when needed")
    
    # Check if modules exist
    if os.path.exists('modules'):
        print("✅ modules/ directory exists")
        if os.path.exists('modules/telegram_client.py'):
            print("✅ modules/telegram_client.py exists")
        if os.path.exists('modules/ai_analyzer.py'):
            print("✅ modules/ai_analyzer.py exists")
    
    print("\n" + "="*60)
    print("🌐 Web Interface: http://localhost:5000")
    print("📊 Dashboard: http://localhost:5000/dashboard")
    print("🤖 Available Agents:")
    print("   • Telegram: ✅ REAL MONITORING (AI-powered)")
    print("   • Facebook: ⚠️  Requires additional setup")
    print("   • Reddit: ⚠️  Requires additional setup")
    print("📝 Logging: Console + Database + File")
    print("💾 Data Storage: SQLite (persistent)")
    print("="*60)

    print("\n✅ System ready for REAL Telegram monitoring!")
    print("📢 REAL AGENT ACTIVITY WILL BE DISPLAYED HERE:")
    print("-" * 60 + "\n")
    
    try:
        app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        print("\n👋 Shutting down all agents...")
        # Stop all agents
        for agent_id in ['telegram', 'facebook', 'reddit']:
            agent_manager.stop_agent(agent_id)
        print("✅ System shutdown complete")