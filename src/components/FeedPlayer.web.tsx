import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/**
 * Один постійний плеєр YouTube (офіційний IFrame API) для стрічки трейлерів у браузері.
 * Браузери не дозволяють автозапуск зі звуком, доки людина не торкнеться сторінки.
 * Тому: перший трейлер стартує без звуку, перший дотик будь-де вмикає звук,
 * і далі той самий плеєр перемикає відео (loadVideoById) — звук лишається.
 */
type Props = { videoKey: string | null; top: number; height: number; visible: boolean; playing: boolean };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

let soundUnlocked = false;

export function FeedPlayer({ videoKey, top, height, visible, playing }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const player = useRef<any>(null);
  const readyRef = useRef(false);
  const currentKey = useRef<string | null>(null);
  const [muted, setMuted] = useState(!soundUnlocked);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const wantPlay = useRef(playing && visible);
  wantPlay.current = playing && visible;

  const applySound = () => {
    const p = player.current;
    if (!p || !readyRef.current) return;
    if (mutedRef.current) p.mute();
    else {
      p.unMute();
      p.setVolume(100);
    }
  };

  // створюємо плеєр один раз
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !host.current || !videoKey) return;
      const el = document.createElement('div');
      host.current.appendChild(el);
      currentKey.current = videoKey;
      player.current = new YT.Player(el, {
        width: '100%',
        height: '100%',
        videoId: videoKey,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1, mute: soundUnlocked ? 0 : 1, origin: window.location.origin },
        events: {
          onReady: () => {
            readyRef.current = true;
            applySound();
            if (wantPlay.current) player.current.playVideo();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        player.current?.destroy();
      } catch {}
      player.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // перший дотик будь-де вмикає звук (дозвіл браузера на звук)
  useEffect(() => {
    if (soundUnlocked) return;
    const unlock = () => {
      soundUnlocked = true;
      mutedRef.current = false;
      setMuted(false);
      applySound();
      if (wantPlay.current) player.current?.playVideo?.();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // наступний трейлер — у тому ж плеєрі, зі звуком
  useEffect(() => {
    const p = player.current;
    if (!p || !readyRef.current || !videoKey || videoKey === currentKey.current) return;
    currentKey.current = videoKey;
    p.loadVideoById(videoKey);
    applySound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey]);

  useEffect(() => {
    const p = player.current;
    if (!p || !readyRef.current) return;
    if (playing && visible) {
      applySound();
      p.playVideo();
    } else p.pauseVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, visible]);

  const toggleSound = () => {
    soundUnlocked = true;
    mutedRef.current = !muted;
    setMuted(!muted);
    applySound();
    if (!mutedRef.current) player.current?.playVideo?.();
  };

  return (
    <View pointerEvents={visible ? 'box-none' : 'none'} style={[styles.wrap, { top, height, opacity: visible ? 1 : 0 }]}>
      {React.createElement('div', { ref: host, style: { position: 'absolute', inset: 0, background: '#000' } })}
      <Pressable onPress={toggleSound} style={styles.sound} hitSlop={8} accessibilityLabel={muted ? 'Увімкнути звук' : 'Вимкнути звук'}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
        {muted ? <Text style={styles.soundText}>Увімкнути звук</Text> : null}
      </Pressable>
    </View>
  );
}

export const USES_FEED_PLAYER = true;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, backgroundColor: '#000', zIndex: 3 },
  sound: {
    position: 'absolute',
    left: 12,
    bottom: -46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
  },
  soundText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
