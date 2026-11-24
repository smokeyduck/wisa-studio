// electron-vite forwards Electron's exit code and stops its Vite server.
// The owning dev launcher starts both again on this explicit restart request.
export const DEV_RESTART_EXIT_CODE = 75;
export const DEV_RESTART_ENV = "WISA_DEV_RESTART";
