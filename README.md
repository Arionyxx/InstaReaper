# InstaReaper - Instagram Reels Downloader

A full-featured Electron desktop application for downloading Instagram Reels via Torbox API with optional Google Drive sync.

## Features

- **Embedded Instagram Browser**: Browse Instagram within the app and extract reels directly
- **Torbox Integration**: Use Torbox API for reliable downloading with fallback support
- **Keyword-based Filtering**: Filter discovered reels by keywords against captions/hashtags/owner
- **Download Queue**: Manage multiple downloads with pause/resume/cancel functionality
- **Library Management**: View, play, and organize downloaded content
- **Google Drive Sync**: Optional sync to Google Drive folders
- **Modern UI**: Glassmorphism design with neutral colors, smooth animations
- **Local-first**: No external database, uses electron-store and JSON files

## Tech Stack

- **Frontend**: React + TypeScript, Tailwind CSS, Lucide React
- **Desktop**: Electron (main + preload + renderer processes)
- **Build**: Vite, ESLint, Prettier
- **Security**: Context isolation, Zod validation, secure IPC

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd instareaper

# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build

# Package application
npm run package
```

## Configuration

### Torbox API

1. Get your API key from the Torbox dashboard
2. Go to Settings → Torbox API Configuration
3. Enter your API key and click "Test Connection"

### Download Directory

- Default: `Downloads/InstaReaper` in your user directory
- Customizable via Settings → Download Settings

### Google Drive Sync (Optional)

1. Enable "Google Drive Sync" in Settings
2. Authenticate with Google (OAuth flow)
3. Optionally specify a Drive folder ID

## Usage

1. **Extract Reels**: 
   - Click "Open Instagram" to launch the embedded browser
   - Navigate to any Instagram page with reels
   - Click "Extract from current page" to find reels

2. **Filter & Select**:
   - Use keyword filters to find specific content
   - Select reels with checkboxes or "Select All"
   - Click "Download Selected" to add to queue

3. **Manage Downloads**:
   - View progress in the Downloads tab
   - Pause/resume/cancel individual downloads
   - Retry failed downloads

4. **Library**:
   - Browse downloaded content in the Library tab
   - Play videos in-app
   - Search and filter by keywords
   - Delete unwanted files

## Project Structure

```
instareaper/
├── electron/                 # Electron main process
│   ├── main.ts             # Main application entry
│   ├── preload/            # Preload scripts
│   ├── torbox-api.ts      # Torbox API client
│   └── download-queue.ts   # Download queue management
├── src/                    # React renderer process
│   ├── components/          # Reusable UI components
│   ├── pages/             # Main application pages
│   ├── contexts/          # React contexts
│   └── types/            # TypeScript definitions
├── dist/                  # Built renderer output
├── dist-electron/          # Built main process output
└── release/               # Packaged application
```

## Security

- **Context Isolation**: Enabled for secure renderer-main communication
- **Node Integration**: Disabled in renderer process
- **Zod Validation**: All IPC data is validated
- **No Credential Storage**: Instagram login handled via in-app session only

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run package` - Package as distributable app
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Architecture

The app follows Electron best practices:

1. **Main Process**: Handles system APIs, file operations, and external services
2. **Preload Scripts**: Secure bridge between main and renderer processes
3. **Renderer Process**: React-based UI with no direct system access

All communication between processes uses IPC with Zod schema validation for type safety.

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and feature requests, please use the GitHub issue tracker.