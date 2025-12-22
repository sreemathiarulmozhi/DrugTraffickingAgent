"""
Telegram Client for extension
"""
import os
import asyncio
import logging
from typing import List, Dict, Optional
from telethon import TelegramClient
import json

class TelegramExtensionClient:
    """Telegram client for the extension"""
    
    def __init__(self):
        self.api_id = int(os.getenv('TELEGRAM_API_ID'))
        self.api_hash = os.getenv('TELEGRAM_API_HASH')
        self.phone = os.getenv('TELEGRAM_PHONE')
        self.session_name = os.getenv('TELEGRAM_SESSION_NAME', 'telegram_extension_session')
        self.client = None
        self.is_connected = False
        
    async def connect(self):
        """Connect to Telegram"""
        try:
            print(f"🔐 Connecting to Telegram as {self.phone}...")
            
            self.client = TelegramClient(
                self.session_name,
                self.api_id,
                self.api_hash
            )
            
            await self.client.start(phone=self.phone)
            self.is_connected = True
            
            # Verify connection
            me = await self.client.get_me()
            print(f"✅ Connected as: {me.first_name} ({me.phone})")
            return True
            
        except Exception as e:
            print(f"❌ Telegram connection failed: {e}")
            if "session already had an authorized user" in str(e):
                print("💡 Try deleting .session files and restarting")
            return False
    
    async def disconnect(self):
        """Disconnect from Telegram"""
        if self.client and self.is_connected:
            await self.client.disconnect()
            self.is_connected = False
            print("📴 Disconnected from Telegram")
    
    async def scan_recent_chats(self, chat_limit=10, messages_per_chat=10):
        """Scan recent chats for messages"""
        try:
            if not self.client or not self.is_connected:
                await self.connect()
                if not self.is_connected:
                    return {"error": "Failed to connect to Telegram"}
            
            print(f"🔍 Scanning {chat_limit} recent chats...")
            
            # Get recent dialogs
            dialogs = await self.client.get_dialogs(limit=chat_limit)
            
            all_messages = []
            
            for dialog in dialogs:
                if dialog.is_channel or dialog.is_group or dialog.is_user:
                    try:
                        chat_name = dialog.name or dialog.title or "Unknown"
                        print(f"  📥 Fetching messages from: {chat_name}")
                        
                        # Fetch recent messages
                        messages = []
                        async for message in self.client.iter_messages(
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
                            chat_data = {
                                'chat_name': chat_name,
                                'chat_id': dialog.id,
                                'type': 'channel' if dialog.is_channel else 'group' if dialog.is_group else 'private',
                                'total_participants': getattr(dialog.entity, 'participants_count', 1),
                                'messages': messages,
                                'message_count': len(messages)
                            }
                            all_messages.append(chat_data)
                            
                            print(f"    ✅ Found {len(messages)} messages")
                            
                    except Exception as e:
                        print(f"    ⚠️ Error scanning {chat_name}: {e}")
                        continue
            
            result = {
                'total_chats_scanned': len(all_messages),
                'total_messages': sum(len(chat['messages']) for chat in all_messages),
                'scanned_at': '2024-01-01T00:00:00',
                'chats': all_messages
            }
            
            print(f"✅ Scan complete: {result['total_messages']} messages from {result['total_chats_scanned']} chats")
            return result
            
        except Exception as e:
            print(f"❌ Scan error: {e}")
            return {"error": str(e)}