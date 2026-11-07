import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/**
 * Один постійний YouTube-плеєр для стрічки трейлерів у браузері.
 * Браузери (особливо iPhone) не дозволяють автозапуск зі звуком, доки людина
 * не торкнеться сторінки. Тому: перший трейлер стартує без звуку, після першого
 * дотику вмикаємо звук — і далі той самий плеєр просто перемикає відео
 * (loadVideoById), зберігаючи звук для всіх наступних трейлерів.
 */
type Props = {
  videoKey: string | null;
  top: number;
  height: number;
  visible: boolean;
  playing: boolean;
};

let soundUnlocked = false;

export function FeedPlayer({ videoKey, top, height, visible, playing }: Props) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [initialKey] = useState(videoKey);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(!soundUnlocked);
  const currentKey = useRef(initialKey);
  // src фіксуємо один раз: зміна src перезавантажила б плеєр і скинула звук
  const [src] = useState(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `https://www.youtube.com/embed/${initialKey}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1&mute=${soundUnlocked ? 0 : 1}&origin=${encodeURIComponent(origin)}`;
  });

  const send = (func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  };

  // Перше торкання будь-де на сторінці «розблоковує» звук
  useEffect(() => {
    if (soundUnlocked) return;
    const unlock = () => {
      soundUnlocked = true;
      setMuted(false);
      send('unMute');
      send('setVolume', [100]);
      send('playVideo');
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
  }, []);

  // Повідомлення від плеєра: чекаємо готовності
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (typeof e.data !== 'string' || !e.origin.includes('youtube')) return;
      try {
        const d = JSON.parse(e.data);
        if (d.event === 'onReady' || d.event === 'initialDelivery') setReady(true);
      } catch {}
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Перемикання відео в тому самому плеєрі (звук зберігається)
  useEffect(() => {
    if (!videoKey || !ready || videoKey === currentKey.current) return;
    currentKey.current = videoKey;
    send('loadVideoById', [videoKey]);
    if (!muted) send('unMute');
  }, [videoKey, ready, muted]);

  useEffect(() => {
    if (!ready) return;
    if (playing && visible) {
      send('playVideo');
      if (!muted) send('unMute');
    } else send('pauseVideo');
  }, [playing, visible, ready, muted]);

  const toggleSound = () => {
    soundUnlocked = true;
    if (muted) {
      send('unMute');
      send('setVolume', [100]);
      send('playVideo');
    } else send('mute');
    setMuted(!muted);
  };

  if (!initialKey) return null;

  return (
    <View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.wrap, { top, height, opacity: visible ? 1 : 0 }]}
    >
      {React.createElement('iframe', {
        ref: frame,
        src,
        onLoad: () => {
          // «підписуємось» на події плеєра
          frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'feed' }), '*');
          setTimeout(() => setReady(true), 800);
        },
        style: { width: '100%', height: '100%', border: 0, background: '#000' },
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowFullScreen: true,
      })}
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
