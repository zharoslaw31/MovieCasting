export const colors = {
  bg: '#0A0A12',
  bgElevated: '#12121D',
  card: '#181826',
  cardHigh: '#22223380',
  border: '#2A2A3D',
  text: '#F5F5FA',
  textDim: '#A3A3B8',
  textMuted: '#6B6B82',
  accent: '#FF3D71',
  accent2: '#FF8A3D',
  like: '#2EE59D',
  nope: '#FF4D67',
  watched: '#4DA3FF',
  gold: '#FFC94D',
  overlay: 'rgba(10,10,18,0.72)',
};

export const gradients = {
  brand: ['#FF3D71', '#FF8A3D'] as const,
  like: ['#21D4A0', '#2EE59D'] as const,
  nope: ['#FF4D67', '#FF7A59'] as const,
  watched: ['#4D7CFF', '#4DA3FF'] as const,
  cardFade: ['transparent', 'rgba(10,10,18,0.55)', 'rgba(10,10,18,0.97)'] as const,
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 };

export const space = (n: number) => n * 4;

export const TAB_BAR_HEIGHT = 64;
