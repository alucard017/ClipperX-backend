const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

dotenv.config();
const app = express();
const port = process.env.PORT || 8000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;
const DOWNLOAD_DIR = path.join(__dirname, "download");

// ffmpeg and yt-dlp paths (update if needed)
const YT_DLP_PATH = "yt-dlp"; // use command name (it's in PATH inside container)
const FFMPEG_PATH = "ffmpeg"; // use command name

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://clipper-x-mu.vercel.app",
      "http://127.0.0.1:5500",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json());
app.use("/download", express.static(DOWNLOAD_DIR));

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

// === Utility: convert seconds to HH:MM:SS ===
function secondsToHHMMSS(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// === Validate tweet URL ===
function isValidTweetUrl(url) {
  return /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d+/.test(
    url
  );
}

app.post("/clip", async (req, res) => {
  try {
    const { tweetUrl, start, end } = req.body;

    // === Input validations ===
    if (!tweetUrl || typeof tweetUrl !== "string") {
      return res
        .status(400)
        .json({ error: "tweetUrl is required and must be a string." });
    }

    if (!isValidTweetUrl(tweetUrl)) {
      return res.status(400).json({ error: "Invalid tweet URL." });
    }

    if (typeof start !== "number" || typeof end !== "number" || start >= end) {
      return res.status(400).json({
        error:
          "Start and end must be valid numbers, and end must be greater than start.",
      });
    }

    const id = Date.now();
    const rawFile = path.join(DOWNLOAD_DIR, `${id}.mp4`);
    const clippedFile = path.join(DOWNLOAD_DIR, `clipped_${id}.mp4`);
    const fixedUrl = tweetUrl.replace("x.com", "twitter.com");

    // === Step 1: Download full video ===
    await execPromise(`"${YT_DLP_PATH}" -o "${rawFile}" "${fixedUrl}"`);

    // Ensure video downloaded
    if (!fs.existsSync(rawFile)) {
      return res.status(500).json({ error: "Video download failed." });
    }

    // === Step 2: Clip using ffmpeg ===
    const formattedStart = secondsToHHMMSS(start);
    const formattedEnd = secondsToHHMMSS(end);

    const ffmpegCmd = `"${FFMPEG_PATH}" -ss ${formattedStart} -i "${rawFile}" -to ${formattedEnd} -c copy "${clippedFile}"`;
    console.log("Running ffmpeg:", ffmpegCmd);
    await execPromise(ffmpegCmd);

    // === Step 3: Cleanup original ===
    fs.unlink(rawFile, () => {});

    // === Step 4: Auto delete clipped file after 30s ===
    setTimeout(() => {
      fs.unlink(clippedFile, (err) => {
        if (err) console.error("Failed to delete:", clippedFile);
        else console.log("Deleted:", clippedFile);
      });
    }, 120_000);

    // === Step 5: Respond with download link ===
    return res.status(200).json({
      success: true,
      message: "Video clipped successfully.",
      downloadUrl: `${BASE_URL}/download/${path.basename(clippedFile)}`,
    });
  } catch (err) {
    console.error("Server error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to process video. Please try again.",
    });
  }
});

// === Wrap exec in Promise ===
function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`Command failed: ${cmd}\n${stderr}`);
        return reject(new Error(stderr || stdout));
      }
      resolve(stdout);
    });
  });
}

app.listen(port, () => {
  console.log(`🚀 Server running at ${BASE_URL}`);
});
