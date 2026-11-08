import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/apiClient';

const CHALLENGES = [
  { value: 'turn_left', label: 'Slowly turn your head to the left, then face the camera.' },
  { value: 'turn_right', label: 'Slowly turn your head to the right, then face the camera.' },
  { value: 'smile', label: 'Look directly at the camera and smile naturally.' },
  { value: 'look_up', label: 'Look slightly upward, then look directly at the camera.' }
];

const FACE_API_SCRIPT = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js';
const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

function loadFaceApi() {
  if (window.faceapi) return Promise.resolve(window.faceapi);
  if (window.__h2hFaceApiPromise) return window.__h2hFaceApiPromise;
  window.__h2hFaceApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = FACE_API_SCRIPT;
    script.async = true;
    script.onload = () => window.faceapi ? resolve(window.faceapi) : reject(new Error('Face matching library did not initialize.'));
    script.onerror = () => reject(new Error('Could not load the browser face matching library.'));
    document.head.appendChild(script);
  }).catch(error => {
    window.__h2hFaceApiPromise = null;
    throw error;
  });
  return window.__h2hFaceApiPromise;
}

async function loadFaceModels(faceapi) {
  if (window.__h2hFaceModelsPromise) return window.__h2hFaceModelsPromise;
  window.__h2hFaceModelsPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
  ]).catch(error => {
    window.__h2hFaceModelsPromise = null;
    throw error;
  });
  return window.__h2hFaceModelsPromise;
}

function loadPhoto(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Profile photo is not available for local comparison. Its image host may block browser access.'));
    image.src = url;
  });
}

async function assessInBrowser(videoBlob, photos) {
  const faceapi = await loadFaceApi();
  await loadFaceModels(faceapi);
  const urls = (Array.isArray(photos) ? photos : [])
    .map(photo => typeof photo === 'string' ? photo : photo?.url)
    .filter(url => typeof url === 'string' && /^https:\/\//i.test(url))
    .slice(0, 6);
  if (!urls.length) throw new Error('Add at least one accessible profile photo before using face matching.');

  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('The recorded video could not be decoded in this browser.'));
      video.load();
    });

    const referenceDescriptors = [];
    for (const url of urls) {
      try {
        const image = await loadPhoto(url);
        const result = await faceapi.detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
          .withFaceLandmarks(true).withFaceDescriptor();
        if (result?.descriptor) referenceDescriptors.push(result.descriptor);
      } catch {
        // One inaccessible photo must not prevent comparison with the remaining photos.
      }
    }
    if (!referenceDescriptors.length) {
      return { status: 'unavailable', framesAnalyzed: 0, framesWithFace: 0, profilePhotosCompared: 0, bestDistance: null };
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const fractions = [0.12, 0.32, 0.52, 0.72, 0.9].filter(fraction => video.duration > 0 && fraction < 1);
    let framesWithFace = 0;
    let bestDistance = null;
    let framesAnalyzed = 0;

    for (const fraction of fractions) {
      await new Promise((resolve, reject) => {
        video.addEventListener('seeked', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('Could not sample the recorded video.')), { once: true });
        video.currentTime = fraction * video.duration;
      });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      framesAnalyzed += 1;
      const result = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
        .withFaceLandmarks(true).withFaceDescriptor();
      if (!result?.descriptor) continue;
      framesWithFace += 1;
      for (const reference of referenceDescriptors) {
        const distance = faceapi.euclideanDistance(result.descriptor, reference);
        if (Number.isFinite(distance) && (bestDistance === null || distance < bestDistance)) bestDistance = distance;
      }
    }

    return {
      status: framesWithFace > 0 && bestDistance !== null ? 'assessed' : 'unavailable',
      framesAnalyzed,
      framesWithFace,
      profilePhotosCompared: referenceDescriptors.length,
      bestDistance
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(videoUrl);
  }
}

const PhotoVerificationPanel = ({ isVerified = false, photos = [] }) => {
  const [status, setStatus] = useState({ status: 'loading' });
  const [challenge, setChallenge] = useState(null);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoMimeType, setVideoMimeType] = useState('video/webm');
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [assessmentNote, setAssessmentNote] = useState('');
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
    };
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCapture = async () => {
    setError('');
    setAssessmentNote('');
    setVideoBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    const selected = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    setChallenge(selected);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Your browser does not support secure video recording. Please use a recent Chrome, Edge, Firefox or Safari browser.');
      }
      const requestedMimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      if (!requestedMimeType) throw new Error('Your browser does not support a compatible video recording format.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const recorder = new MediaRecorder(stream, { mimeType: requestedMimeType, videoBitsPerSecond: 450000 });
      const finalMimeType = recorder.mimeType || requestedMimeType;
      setVideoMimeType(finalMimeType.split(';')[0]);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: finalMimeType });
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
        : (err.message || 'Unable to start your camera. Please use a secure browser connection and try again.'));
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.delete('/verification');
      setStatus({ status: 'not_submitted' });
      setVideoBlob(null);
      setConsent(false);
      setAssessmentNote('');
    } catch (err) {
      setError(err.message || 'Could not withdraw your verification request.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!videoBlob || !challenge || !consent || busy) return;
    setBusy(true);
    setError('');
    setAssessmentNote('');
    try {
      let clientAssessment = { status: 'unavailable', framesAnalyzed: 0, framesWithFace: 0, profilePhotosCompared: 0, bestDistance: null };
      try {
        setAssessmentNote('Comparing your selfie with your profile photos on this device…');
        clientAssessment = await assessInBrowser(videoBlob, photos);
        setAssessmentNote(clientAssessment.status === 'assessed'
          ? 'Local face comparison completed. The result is advisory and will not approve or reject your request.'
          : 'Local comparison was inconclusive. Your request will continue to manual review.');
      } catch {
        setAssessmentNote('Browser face comparison was unavailable. Your request will continue to manual review.');
      }

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(videoBlob);
      });
      const result = await apiClient.post('/verification', {
        videoBase64: base64,
        mimeType: videoMimeType,
        challenge: challenge.value,
        consent: true,
        clientAssessment
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
        Record a short live selfie video. Your browser can compare sampled frames with your profile photos using your device processor. Profile image pixels and face descriptors used for this optional comparison stay on your device. A superadmin makes the final decision. The submitted video is encrypted and removed after review or after seven days.
      </p>
      {status.status === 'loading' ? <p>Loading verification status…</p> : null}
      {isVerified || status.status === 'verified' || status.status === 'approved' ? (
        <p className="text-sm text-green-700 dark:text-green-400">Your profile is verified.</p>
      ) : null}
      {status.status === 'pending_review' ? (
        <div>
          <p className="text-sm text-amber-700 dark:text-amber-400">Your selfie video is waiting for a manual review.</p>
          <button type="button" onClick={withdraw} disabled={busy} className="mt-3 rounded-full border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50">
            {busy ? 'Withdrawing…' : 'Withdraw request and delete video'}
          </button>
        </div>
      ) : null}
      {status.status === 'rejected' ? (
        <p className="text-sm text-red-600">Your previous request was not approved. {status.reviewReason || 'You can submit a new recording.'}</p>
      ) : null}
      {!isVerified && status.status !== 'verified' && status.status !== 'approved' && status.status !== 'pending_review' && (
        <>
          <p className="text-sm mb-3">Camera access starts only when you press the button. Face matching runs locally after recording. Its result is untrusted and is not proof of identity or liveness. A superadmin reviews the video and profile photos before any approval.</p>
          <video ref={videoRef} src={previewUrl || undefined} controls playsInline muted className="w-full max-w-sm rounded-xl bg-black aspect-video" />
          {challenge && <p className="my-3 font-medium">Your random challenge: {challenge.label}</p>}
          <div className="flex flex-wrap gap-3 my-3">
            <button type="button" onClick={startCapture} disabled={recording || busy} className="rounded-full bg-primary px-5 py-2 text-white disabled:opacity-50">
              {recording ? 'Recording…' : 'Start 7-second selfie'}
            </button>
            {recording && <button type="button" onClick={() => recorderRef.current?.stop()} className="rounded-full border px-5 py-2">Stop recording</button>}
          </div>
          {videoBlob && <p className="text-sm text-green-700 dark:text-green-400">Recording ready ({Math.ceil(videoBlob.size / 1024)} KB). Review it before submitting.</p>}
          {assessmentNote && <p role="status" className="my-2 text-sm text-neutral-600 dark:text-neutral-300">{assessmentNote}</p>}
          <label className="flex items-start gap-2 text-sm my-3">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1" />
            <span>I consent to browser-side biometric face comparison of this selfie video against my profile photos, and to authorized superadmins reviewing the submitted video. The browser comparison is not a verified identity or liveness check. The encrypted video is retained for up to seven days if not reviewed sooner. Only aggregate, untrusted comparison metadata is submitted with the request.</span>
          </label>
          <button type="button" onClick={submit} disabled={!videoBlob || !consent || busy} className="rounded-full bg-green-600 px-5 py-2 text-white disabled:opacity-50">
            {busy ? 'Processing and submitting…' : 'Submit for review'}
          </button>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
};

export default PhotoVerificationPanel;
