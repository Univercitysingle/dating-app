import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import "@tensorflow/tfjs-node";
import * as canvas from "canvas";
import * as faceapi from "@vladmandic/face-api";

const { Canvas, Image, ImageData, loadImage } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const MODEL_PATH = process.env.FACE_MODEL_PATH || path.join(process.cwd(), "node_modules/@vladmandic/face-api/model");
let modelsReady;
async function loadModels() {
  if (!modelsReady) modelsReady = (async () => {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
  })();
  return modelsReady;
}

function readJson(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request exceeds the 5 MB processing limit."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("Invalid JSON request.")); }
    });
    req.on("error", reject);
  });
}

function runFfmpeg(videoPath, outputPattern) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", videoPath,
      "-vf", "fps=1,scale='min(640,iw)':-2", "-frames:v", "7",
      "-q:v", "5", outputPattern
    ]);
    let error = "";
    child.stderr.on("data", chunk => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(error.slice(0, 300) || "Video decoding failed.")));
  });
}

async function describeImage(buffer) {
  const image = await loadImage(buffer);
  const detections = await faceapi.detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (!detections.length) return null;
  detections.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return detections[0].descriptor;
}

async function assess(payload) {
  if (!payload || typeof payload.videoBase64 !== "string" ||
      !["video/webm", "video/mp4"].includes(payload.mimeType) ||
      !Array.isArray(payload.profilePhotos) || payload.profilePhotos.length < 1 ||
      payload.profilePhotos.length > 6) {
    const error = new Error("A video and between one and six profile photos are required.");
    error.status = 400;
    throw error;
  }
  const video = Buffer.from(payload.videoBase64, "base64");
  if (!video.length || video.length > 3 * 1024 * 1024) {
    const error = new Error("Video must be 3 MB or smaller.");
    error.status = 413;
    throw error;
  }
  const id = randomUUID();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "face-check-"));
  const videoPath = path.join(workDir, payload.mimeType === "video/mp4" ? "input.mp4" : "input.webm");
  try {
    await loadModels();
    await fs.writeFile(videoPath, video, { mode: 0o600 });
    await runFfmpeg(videoPath, path.join(workDir, "frame-%02d.jpg"));
    const names = (await fs.readdir(workDir)).filter(name => /^frame-\d+\.jpg$/.test(name)).sort();
    const profileDescriptors = [];
    for (const item of payload.profilePhotos) {
      if (typeof item !== "string" || item.length > 2_000_000) continue;
      try {
        const descriptor = await describeImage(Buffer.from(item, "base64"));
        if (descriptor) profileDescriptors.push(descriptor);
      } catch { /* Ignore one corrupt profile image; continue with remaining photos. */ }
    }
    if (!profileDescriptors.length) {
      return { engine: "@vladmandic/face-api", status: "manual_review", reason: "No usable face found in profile photos.", framesAnalyzed: names.length, framesWithFace: 0, profilePhotosCompared: 0, bestDistance: null, challengeAssessment: "not_verified" };
    }
    let framesWithFace = 0;
    let bestDistance = null;
    for (const name of names) {
      const frame = await fs.readFile(path.join(workDir, name));
      const descriptor = await describeImage(frame);
      if (!descriptor) continue;
      framesWithFace += 1;
      for (const reference of profileDescriptors) {
        const distance = faceapi.euclideanDistance(descriptor, reference);
        if (Number.isFinite(distance) && (bestDistance === null || distance < bestDistance)) bestDistance = distance;
      }
    }
    return {
      engine: "@vladmandic/face-api",
      engineVersion: "1.7.15",
      status: "manual_review",
      reason: "Face matching is an advisory signal only. No automatic approval or liveness claim is made.",
      framesAnalyzed: names.length,
      framesWithFace,
      profilePhotosCompared: profileDescriptors.length,
      bestDistance,
      challengeAssessment: "not_verified"
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200); res.end(JSON.stringify({ ok: true, service: "face-verification-engine" })); return;
  }
  if (req.method !== "POST" || req.url !== "/assess") {
    res.writeHead(404); res.end(JSON.stringify({ error: "Not found" })); return;
  }
  try {
    const payload = await readJson(req);
    const result = await assess(payload);
    res.writeHead(200); res.end(JSON.stringify(result));
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 422;
    res.writeHead(status); res.end(JSON.stringify({ error: String(error.message || "Face assessment failed").slice(0, 300) }));
  }
});
server.listen(Number(process.env.PORT || 8080), "0.0.0.0");
