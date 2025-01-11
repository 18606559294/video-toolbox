# Video Toolbox

A powerful video download and conversion tool built with Electron.

## Features

- Download videos from multiple platforms (YouTube, Bilibili, etc.)
- Convert videos to different formats
- Batch processing support
- Automatic login support
- Built-in video player
- Cross-platform support

## Installation

### Windows

1. Download the latest installer from [Releases](https://github.com/videotoolbox/video-toolbox/releases)
2. Run the installer and follow the instructions
3. Start Video Toolbox from the Start Menu or Desktop shortcut

### Development

```bash
# Clone the repository
git clone https://github.com/videotoolbox/video-toolbox.git

# Install dependencies
npm install

# Start the app
npm start

# Build the app
npm run dist
```

## Configuration

The app stores its configuration in:
- Windows: `%APPDATA%/video-toolbox/`
- macOS: `~/Library/Application Support/video-toolbox/`
- Linux: `~/.config/video-toolbox/`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Electron
- FFmpeg
- And all other open source projects that made this possible
