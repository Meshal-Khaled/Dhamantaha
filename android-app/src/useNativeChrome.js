import { useEffect, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const android = Capacitor.getPlatform() === 'android';
const appChrome = android ? registerPlugin('AppChrome') : null;

/** Native Back is enabled only after its JS listener is ready; Home keeps Android's default. */
export function useNativeChrome({ theme, onBack, canGoBack }) {
  const callback = useRef(onBack);
  const requestedBack = useRef(canGoBack);
  const ready = useRef(false);

  useEffect(() => { callback.current = onBack; }, [onBack]);

  useEffect(() => {
    const dark = theme === 'dark';
    const background = dark ? '#102622' : '#f6f9f7';
    const meta = document.querySelector('meta[name="theme-color"]');
    const oldColorScheme = document.documentElement.style.colorScheme;
    const oldThemeColor = meta?.content;
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (meta) meta.content = background;
    if (android) appChrome.setTheme({ theme: dark ? 'dark' : 'light' }).catch(() => {
      console.warn('[Dhamantaha] Android appearance could not be synchronized.');
    });
    return () => {
      document.documentElement.style.colorScheme = oldColorScheme;
      if (meta && oldThemeColor !== undefined) meta.content = oldThemeColor;
    };
  }, [theme]);

  useEffect(() => {
    requestedBack.current = canGoBack;
    if (android && ready.current) appChrome.setBackHandler({ enabled: canGoBack }).catch(() => {});
  }, [canGoBack]);

  useEffect(() => {
    if (!android) return;
    let active = true;
    let listener;
    appChrome.addListener('back', () => callback.current?.()).then((handle) => {
      if (!active) { handle.remove().catch(() => {}); return; }
      listener = handle;
      ready.current = true;
      return appChrome.setBackHandler({ enabled: requestedBack.current });
    }).catch(() => {
      console.warn('[Dhamantaha] Android Back navigation could not be connected.');
    });
    return () => {
      active = false;
      ready.current = false;
      appChrome.setBackHandler({ enabled: false }).catch(() => {});
      listener?.remove().catch(() => {});
    };
  }, []);
}
