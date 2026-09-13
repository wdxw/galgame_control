// Shared constants between main process and renderer

// Cover image file name patterns (case-insensitive)
export const COVER_FILE_PATTERNS = [
  'cover',
  'package',
  'package_omote',
  '封面',
  'jacket',
  'front',
  'title',
  'poster',
  'thumbnail',
  'box'
]

// Cover image file extensions
export const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']

// Subdirectories to search for covers
export const COVER_SUBDIRS = ['CG', 'image', 'data/image', 'pack', 'resources', 'graphic']

// EXE names that are definitely NOT game executables
export const EXE_BLACKLIST_PATTERNS = [
  /^unins[0-9]*\.exe$/i,
  /^uninstall/i,
  /^un\.exe$/i,
  /^setup\.exe$/i,
  /^install\.exe$/i,
  /vcredist/i,
  /dxsetup/i,
  /dotnet/i,
  /directx/i,
  /\.vshost\.exe$/i
]

// Folders unlikely to contain the main game EXE
export const DEPRIORITIZED_FOLDERS = ['redist', '_CommonRedist', 'bin', 'tools', 'manual', 'directx', 'vcredist']

// Known visual novel engine executables (higher confidence)
export const KNOWN_VN_ENGINES = [
  'krkr.exe', 'kirikiri.exe', 'siglus.exe', 'siglusengine.exe',
  'malie.exe', 'bgi.exe', 'advhd.exe', 'rlse.exe', 'artemis.exe',
  'ykc.exe', 'reallive.exe', 'avg32.exe', 'avg2000.exe',
  'nscripter.exe', 'onscripter.exe', 'piaip', 'engine.exe',
  'cs2.exe', 'cmvs32.exe', 'cmvs64.exe', 'kirikiroid2.exe',
  'yu-ris.exe', 'bgi.exe', 'majiro.exe', 'qlie.exe'
]

// IPC channel names
export const IPC_CHANNELS = {
  // Library
  GET_ALL_GAMES: 'library:getAll',
  GET_GAME: 'library:get',
  ADD_GAME: 'library:add',
  UPDATE_GAME: 'library:update',
  DELETE_GAME: 'library:delete',
  SEARCH_GAMES: 'library:search',

  // Scanner
  START_SCAN: 'scan:start',
  CANCEL_SCAN: 'scan:cancel',
  SCAN_PROGRESS: 'scan:progress',
  SCAN_COMPLETE: 'scan:complete',

  // Cover
  FIND_LOCAL_COVERS: 'cover:findLocal',
  SEARCH_VNDB: 'cover:searchVndb',
  DOWNLOAD_VNDB_COVER: 'cover:downloadVndb',
  EXTRACT_EXE_ICON: 'cover:extractIcon',
  COPY_COVER_FILE: 'cover:copyCover',

  // Launcher
  LAUNCH_GAME: 'game:launch',
  OPEN_GAME_DIR: 'game:openDir',

  // Dialog
  SELECT_DIRECTORY: 'dialog:selectDirectory',
  SELECT_FILE: 'dialog:selectFile',

  // Settings
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',

  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close'
} as const
