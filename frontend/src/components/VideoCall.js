import React, { useEffect, useState } from "react";

function VideoCall() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;
    fetch("/api/video/jitsi-token", {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(res => res.json())
      .then(data => setUrl(data.url))
      .catch(console.error);
  }, []);

  if (!url) return <p>Loading video call...</p>;

  return (
    <iframe
      title="Video Call"
      src={url}
      allow="camera; microphone"
      style={{ width: "100%", height: "600px", border: 0 }}
    />
  );
}

export default VideoCall;
