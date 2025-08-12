import React, { useState, useRef, useEffect } from "react";

function HeroCaptureSection({ onUploadComplete }) {
  const [media, setMedia] = useState(null);
  const [mode, setMode] = useState("image"); // "image" or "video"
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: mode === "video",
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (err) {
      console.error("Camera access error:", err);
      // TODO: Display error to user
    }
  };

  // Stop camera
  const stopCamera = () => {
    stream?.getTracks()?.forEach(track => track.stop());
    setStream(null);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current || !stream) {
      console.error("Camera stream not available or refs not set.");
      // TODO: Display error to user
      return;
    }
    const canvas = canvasRef.current;
    // Ensure canvas dimensions match video to avoid distortion
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], "hero-capture.jpg", { type: "image/jpeg" });
        uploadToS3(file);
      } else {
        console.error("Canvas toBlob failed");
        // TODO: Display error to user
      }
    }, "image/jpeg");
  };

  // NOTE: This uploadToS3 function assumes the backend endpoint is GET /api/upload-url?type=
  // And the response is { url, key }.
  // The overall app guide also showed a POST /api/s3/upload-url with fileName, fileType in body.
  // Ensure consistency with actual backend implementation.
  const uploadToS3 = async (file) => {
    if (!file) return;
    try {
      // 1. Get presigned URL from backend
      // Using query param for fileType as per the component guide
      const res = await fetch(`/api/upload-url?type=${encodeURIComponent(file.type)}&fileName=${encodeURIComponent(file.name)}`);
      if (!res.ok) {
        throw new Error(`Failed to get presigned URL: ${res.statusText}`);
      }
      const { url } = await res.json(); // Assuming 'key' might not be directly needed by frontend if URL is complete

      // 2. Upload directly to S3
      const uploadResponse = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`S3 Upload failed: ${uploadResponse.statusText}`);
      }

      const mediaUrl = url.split("?")[0]; // Strip query for final URL
      if (onUploadComplete) {
        onUploadComplete(mediaUrl);
      }
      setMedia(mediaUrl); // Display the uploaded media in this component
      stopCamera(); // Stop camera after successful capture/upload
    } catch (err) {
      console.error("Upload failed:", err);
      // TODO: Display error to user (e.g., set an error state)
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type if necessary (e.g. image/* or video/*)
      const acceptedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime'];
      if (!acceptedTypes.includes(file.type)) {
          console.error("Unsupported file type:", file.type);
          // TODO: Display error to user
          return;
      }
      // Validate file size if necessary (e.g. max 10MB for images, 30MB for 30s video)
      // This client-side check is a first pass; backend should also validate.
      uploadToS3(file);
    }
  };

  useEffect(() => {
    // Cleanup function to stop camera when component unmounts
    return () => {
      stopCamera();
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  // Additional useEffect to stop camera if mode changes or media is set (successful upload)
  useEffect(() => {
    if (media || !stream) { // if media was successfully set, or stream is not active
        stopCamera();
    }
  }, [media, mode]); // Stop camera if mode changes or media is set. Stream is not needed here to avoid loop.


  return (
    <div className="w-full p-4 flex flex-col items-center bg-gray-100 dark:bg-gray-700 rounded-xl shadow-md max-w-screen-md mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">Capture Your Hero Media</h2>

      {/* Controls */}
      <div className="flex flex-wrap justify-center items-center gap-2 mb-4">
        {!stream && (
          <button onClick={startCamera} className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">
            Start Camera
          </button>
        )}
        {stream && (
          <button onClick={stopCamera} className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
            Stop Camera
          </button>
        )}
        <button
          onClick={() => setMode("image")}
          className={`px-4 py-2 rounded-md ${mode === "image" ? "bg-blue-500 text-white" : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400"}`}
        >
          Image Mode
        </button>
        <button
          onClick={() => setMode("video")}
          className={`px-4 py-2 rounded-md ${mode === "video" ? "bg-blue-500 text-white" : "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400"}`}
        >
          Video Mode
        </button>
        {stream && mode === "image" && (
          <button onClick={captureImage} className="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600">
            Capture Photo
          </button>
        )}
        {/* Simple file input, can be styled better */}
        <label className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 cursor-pointer">
          Upload File
          <input type="file" accept="image/*,video/*" onChange={handleFileInput} className="hidden" />
        </label>
      </div>

      {/* Camera View / Media Display Area */}
      <div className="w-full aspect-[4/3] bg-black rounded-lg overflow-hidden mb-4 flex items-center justify-center">
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
        ) : media ? null : ( // Only show placeholder if no stream and no media yet
          <p className="text-gray-400">Camera is off or media uploaded.</p>
        )}
      </div>
      <canvas ref={canvasRef} width={640} height={480} className="hidden" /> {/* Canvas for image capture, initial size */}

      {/* Display Captured/Uploaded Media */}
      {media && (
        <div className="mt-4 w-full max-w-sm">
          <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Your Hero Media:</h3>
          {media.startsWith("data:") || media.endsWith(".jpg") || media.endsWith(".jpeg") || media.endsWith(".png") || media.endsWith(".gif") ? ( // Basic check for image
            <img src={media} alt="Captured or Uploaded Hero Media" className="rounded-lg w-full object-contain shadow-md" />
          ) : ( // Assume video otherwise
            <video src={media} controls className="rounded-lg w-full object-contain shadow-md" />
          )}
        </div>
      )}
    </div>
  );
}

export default HeroCaptureSection;
