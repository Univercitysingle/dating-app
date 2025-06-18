import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const socketRef = useRef(null);
  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    socketRef.current = io("/", {
      auth: { token: user.token },
    });

    socketRef.current.on("connect", () => {
      socketRef.current.emit("joinRoom", "general");
    });

    socketRef.current.on("message", (message) => {
      setMessages((msgs) => [...msgs, message]);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [user.token]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socketRef.current.emit("sendMessage", { roomId: "general", message: input });
    setInput("");
  };

  return (
    <div>
      <h2>Chat Room</h2>
      <div style={{ border: "1px solid black", height: 300, overflowY: "scroll" }}>
        {messages.map((msg, idx) => (
          <div key={idx}>
            <b>{msg.user}:</b> {msg.message} <i>{new Date(msg.timestamp).toLocaleTimeString()}</i>
          </div>
        ))}
      </div>
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default Chat;
