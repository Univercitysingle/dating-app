import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/apiClient';

const CHALLENGES = [
  { value: 'turn_left', label: 'Slowly turn your head to the left, then face the camera.' },
  { value: 'turn_right', label: 'Slowly turn your head to the right, then face the camera.' },
  { value: 'smile', label: 'Look directly at the camera and smile naturally.' },
  { value: 'look_up', label: 'Look slightly upward, then look directly at the camera.' }
];

const PhotoVerificationPanel = () => {
  const [status, setStatus] = useState({ status: 'loading' });
  const [challenge, setChallenge] = useState(null);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    apiClient.get('/verification').then(setStatus).catch(err => setError(err.message || 'Could not load verification status.'));
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCapture = async () => {
    setError('');
    setVideoBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    const selected = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    setChallenge(selected);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 450000 });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        if (blob.size > 3 * 1024 * 1024) setError('The recording is larger than 3 MB. Please try again in better lighting.');
        else if (blob.size > 1000) { setVideoBlob(blob); setPreviewUrl(URL.createObjectURL(blob)); }
        else setError('The recording was too short. Please try again.');
        stopCamera();
        setRecording(false);
      };
      recorder.start(250);
      setRecording(true);
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 7000);
    } catch (err) {
      stopCamera();
      setRecording(false);
      setError(err.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access and try again.'
        : 'Unable to start your camera. Please use a secure browser connection and try again.');
    }
  };

  const submit = async () => {
    if (!videoBlob || !challenge || !consent) return;
    setBusy(true);
    setError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(videoBlob);
      });
      const result = await apiClient.post('/verification', {
        videoBase64: base64,
        mimeType: 'video/webm',
        challenge: challenge.value,
        consent: true
      }, { timeout: 60000 });
      setStatus({ status: result.status || 'pending_review', submittedAt: new Date().toISOString() });
      setVideoBlob(null);
      setConsent(false);
    } catch (err) {
      setError(err.message || 'Verification could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profile-settings-group" aria-labelledby="photo-verification-title">
      <h3 id="photo-verification-title">Photo verification</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
        Record a short live selfie video. A superadmin will compare it with your profile photos.
        The video is encrypted and removed after review or after seven days.
      </p>
      {status.status === 'loading' ? <p>Loading verification status…</p> : null}
      {status.status === 'verified' || status.status === 'approved' ? (
        <p className="text-sm text-green-700 dark:text-green-400">Your profile is verified.</p>
      ) : null}
      {status.status === 'pending_review' ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">Your selfie video is waiting for a manual review.</p>
      ) : null}
      {status.status === 'rejected' ? (
        <p className="text-sm text-red-600">Your previous request was not approved. {status.reviewReason || 'You can submit a new recording.'}</p>
      ) : null}
      {status.status !== 'verified' && status.status !== 'approved' && status.status !== 'pending_review' && (
        <>
          <p className="text-sm mb-3">For privacy, camera access starts only when you press the button. We do not use automated face recognition or claim automated liveness detection.</p>
          <video ref={videoRef} src={previewUrl || undefined} controls playsInline muted className="w-full max-w-sm rounded-xl bg-black aspect-video" />
          {challenge && <p className="my-3 font-medium">Your random challenge: {challenge.label}</p>}
          <div className="flex flex-wrap gap-3 my-3">
            <button type="button" onClick={startCapture} disabled={recording || busy} className="rounded-full bg-primary px-5 py-2 text-white disabled:opacity-50">
              {recording ? 'Recording…' : 'Start 7-second selfie'}
            </button>
            {recording && <button type="button" onClick={() => recorderRef.current?.stop()} className="rounded-full border px-5 py-2">Stop recording</button>}
          </div>
          {videoBlob && <p className="text-sm text-green-700 dark:text-green-400">Recording ready ({Math.ceil(videoBlob.size / 1024)} KB). Review it before submitting.</p>}
          <label className="flex items-start gap-2 text-sm my-3">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1" />
            <span>I consent to this selfie video being processed for photo verification, viewed by authorized superadmins, and retained for up to seven days if not reviewed sooner.</span>
          </label>
          <button type="button" onClick={submit} disabled={!videoBlob || !consent || busy} className="rounded-full bg-green-600 px-5 py-2 text-white disabled:opacity-50">
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
};

export default PhotoVerificationPanel;
