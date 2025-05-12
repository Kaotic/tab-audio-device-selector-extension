# Tab Audio Device Selector

A Firefox extension that lets you choose which audio device plays sound from each tab. Simple, useful, and works automatically when you change pages.

## Features

- Select different audio output devices for different browser tabs
- Automatic switching between audio devices based on predefined rules when page change or reload
- Easy-to-use popup interface
- Persistent settings across browser sessions
- Simple and intuitive user experience

## Installation

1. Clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on" and select the manifest.json file in the extension directory

## Usage

1. Click on the extension icon in your browser toolbar
2. Select the desired audio output device from the dropdown menu
3. All audio from the current tab will be routed to the selected device
4. You can enable or disable "automatic switching" option

## Development

The extension is structured as follows:
- `popup/`: Contains the UI elements for the extension popup
- `content_scripts/`: Contains the scripts that run in the context of web pages
- `icons/`: Contains the extension icons

## License

This project is open source and available under the [MIT License](LICENSE).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
