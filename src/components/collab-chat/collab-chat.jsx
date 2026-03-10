import React, { useState, useEffect, useRef } from 'react';

const CollabChat = ({ collabClient }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const bottomRef = useRef(null);

    useEffect(() => {
        if (!collabClient) return;
        collabClient.socket.on('chat-message', (msg) => {
            setMessages(prev => [...prev, msg]);
            if (!open) setUnread(prev => prev + 1);
        });
    }, [collabClient]);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const sendMessage = () => {
        if (!input.trim() || !collabClient) return;
        collabClient.sendChat(input.trim());
        setInput('');
    };

    const handleOpen = () => {
        setOpen(true);
        setUnread(0);
    };

    return (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9998 }}>
            {open ? (
                <div style={{
                    width: '280px', height: '380px',
                    background: 'white', borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        background: '#4C97FF', color: 'white',
                        padding: '10px 14px', fontWeight: 'bold',
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', fontSize: '14px'
                    }}>
                        💬 チャット
                        <button onClick={() => setOpen(false)} style={{
                            background: 'none', border: 'none',
                            color: 'white', cursor: 'pointer', fontSize: '16px'
                        }}>✕</button>
                    </div>

                    {/* メッセージ一覧 */}
                    <div style={{
                        flex: 1, overflowY: 'auto',
                        padding: '10px', display: 'flex',
                        flexDirection: 'column', gap: '8px'
                    }}>
                        {messages.map((msg, i) => (
                            <div key={i}>
                                <span style={{
                                    fontWeight: 'bold', fontSize: '11px',
                                    color: msg.color
                                }}>{msg.name}</span>
                                <span style={{ fontSize: '10px', color: '#999', marginLeft: '6px' }}>{msg.time}</span>
                                <div style={{
                                    background: '#f0f0f0', borderRadius: '8px',
                                    padding: '6px 10px', fontSize: '13px',
                                    marginTop: '2px', wordBreak: 'break-word'
                                }}>{msg.text}</div>
                            </div>
                        ))}
                        <div ref={bottomRef} />
                    </div>

                    {/* 入力欄 */}
                    <div style={{
                        padding: '8px', borderTop: '1px solid #eee',
                        display: 'flex', gap: '6px'
                    }}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            placeholder="メッセージを入力..."
                            style={{
                                flex: 1, padding: '6px 10px',
                                borderRadius: '20px', border: '1px solid #ddd',
                                fontSize: '13px', outline: 'none'
                            }}
                        />
                        <button onClick={sendMessage} style={{
                            background: '#4C97FF', color: 'white',
                            border: 'none', borderRadius: '50%',
                            width: '32px', height: '32px',
                            cursor: 'pointer', fontSize: '14px'
                        }}>➤</button>
                    </div>
                </div>
            ) : (
                <button onClick={handleOpen} style={{
                    width: '52px', height: '52px',
                    background: '#4C97FF', color: 'white',
                    border: 'none', borderRadius: '50%',
                    cursor: 'pointer', fontSize: '22px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    position: 'relative'
                }}>
                    💬
                    {unread > 0 && (
                        <span style={{
                            position: 'absolute', top: '-4px', right: '-4px',
                            background: '#e74c3c', color: 'white',
                            borderRadius: '50%', width: '18px', height: '18px',
                            fontSize: '11px', display: 'flex',
                            alignItems: 'center', justifyContent: 'center'
                        }}>{unread}</span>
                    )}
                </button>
            )}
        </div>
    );
};

export default CollabChat;
