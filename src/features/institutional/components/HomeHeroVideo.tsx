"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";

const subscribe = () => () => {};

export function HomeHeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const interactive = useSyncExternalStore(subscribe, () => true, () => false);

  useEffect(() => {
    const video = videoRef.current;
    if (video && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void video.play().catch(() => {});
    }
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }

  return (
    <div className="nw-hero-media">
      <video
        ref={videoRef}
        poster="/assets/brand/new-wed-home-poster.webp"
        aria-label="Vídeo institucional do Grupo New Wed"
        width={1280}
        height={720}
        preload="none"
        muted
        playsInline
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setPlaying(false)}
      >
        <source src="/assets/videos/new-wed-home/index.m3u8" type="application/vnd.apple.mpegurl" />
        <source src="/assets/videos/new-wed-home.mp4" type="video/mp4" />
      </video>
      <button
        type="button"
        disabled={!interactive}
        aria-label={playing ? "Pausar vídeo institucional" : "Reproduzir vídeo institucional"}
        onClick={togglePlayback}
      >
        {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
