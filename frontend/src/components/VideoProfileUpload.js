import React, { useState } from "react";

function VideoProfileUpload() {
  const [video, setVideo] = useState(null);
  const [status, setStatus] = useState("");
  const user = JSON.parse(localStorage.getItem("user"));

  const uploadVideo = async () => {
    if (!video) {
      setStatus("Select a video first");
      return;
    }
    const formData = new FormData();
    formData.append("video", video);

    try {
      const res = await fetch("/api/video/upload-profile-video", {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) setStatus("Uploaded successfully");
      else setStatus("Upload failed");
    } catch {
      setStatus("Upload failed");
    }
  };

  return (
    <div>
      <input type="file" accept="video/*" onChange={e => setVideo(e.target.files[0])} />
      <button onClick={uploadVideo}>Upload Video</button>
      <p>{status}</p>
    </div>
  );
}

export default VideoProfileUpload;
