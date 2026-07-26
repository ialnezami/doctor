import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'mc-theme';

const useThemeStore = create((set) => ({
  theme: 'dark',
  setTheme: async (theme) => {
    set({ theme });
    await AsyncStorage.setItem(THEME_KEY, theme).catch(() => {});
  },
}));

// Hydrate persisted preference on module load
AsyncStorage.getItem(THEME_KEY)
  .then((saved) => {
    if (saved === 'light' || saved === 'dark') {
      useThemeStore.setState({ theme: saved });
    }
  })
  .catch(() => {});

export default useThemeStore;
