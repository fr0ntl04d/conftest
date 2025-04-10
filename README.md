# Confluence Docker for VS Code

A VS Code extension that runs Confluence Server in Docker containers and lets you edit Confluence content directly in VS Code.

## Features

- Run Confluence Server locally in Docker
- Use PostgreSQL for database persistence
- Import Confluence pages into VS Code
- Edit content while preserving Confluence formatting
- Export content back to Confluence

## Installation

Install from the VS Code Marketplace or download the VSIX file from the repository.

## Requirements

- Docker installed and running
- VS Code 1.60.0 or newer
- Permission to run Docker commands

## How to use
Suggested use: if there are customized macros you'd like to use, recommend creating the page in the confluence environment first and preconfiguring the macros there, then when you are ready to edit import that page in storage format. Make changes within the CDATA brackets to edit the contents of that macro.

![CDATA Bracket where the Macro Contents are edited](image.png)

### Starting Confluence

1. Open Command Palette (Ctrl+Shift+P)
2. Run `Confluence Docker: Start Container`
3. Wait for both PostgreSQL and Confluence containers to initialize
4. Complete the first-time Confluence setup in your browser when prompted

### Database setup (first run only)

If Confluence asks for database details during setup:
- Database Type: PostgreSQL
- Hostname: vscode-confluence-postgres
- Port: 5432
- Database Name: confluence
- Username: confluence
- Password: confluence_password

### Importing content

1. Run `Confluence Docker: Import Content from Confluence`
2. Enter your Confluence credentials
3. Enter the page ID of the page you want to import
4. The content will open in VS Code with formatting preserved

### Editing and exporting
This command will send whatever is in the current editor to the page.  
1. Edit the imported content in VS Code
2. Run `Confluence Docker: Export Code to Confluence`
3. Choose to update the original page or create a new one
4. View the updated page in your browser

### Stopping Confluence

Run `Confluence Docker: Stop Container` to stop both containers.

## Available commands

- `Confluence Docker: Start Container` - Starts Confluence and PostgreSQL
- `Confluence Docker: Stop Container` - Stops both containers
- `Confluence Docker: Check Container Status` - Shows container status
- `Confluence Docker: Import Content from Confluence` - Imports a page
- `Confluence Docker: Export Code to Confluence` - Sends content to Confluence

## Finding page IDs

The page ID can be found in the URL when viewing a page in Confluence:

http://localhost:8090/pages/viewpage.action?pageId=12345

In this example, the page ID is `12345`.

## Notes

- Content is stored in PostgreSQL for persistence
- All Confluence macros and formatting are preserved during import/export
- Default ports: Confluence (8090), PostgreSQL (5432)
