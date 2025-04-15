const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');

// Configuration for the Confluence container
const CONFLUENCE_IMAGE = 'atlassian/confluence-server:latest';
const CONTAINER_NAME = 'vscode-confluence';
const HOST_PORT = 8090;
const CONTAINER_PORT = 8090;

// PostgreSQL container configuration
const PG_IMAGE = 'postgres:13';
const PG_CONTAINER_NAME = 'vscode-confluence-postgres';
const PG_PORT = 5432;
const PG_USER = 'confluence';
const PG_PASSWORD = 'confluence_password';
const PG_DB = 'confluence';
const DOCKER_NETWORK = 'confluence-network';

// Confluence API connection
let confluenceCredentials = {
    username: 'admin',
    password: 'admin',
    baseUrl: `http://localhost:${HOST_PORT}`
};

function activate(context) {
    console.log('Confluence Test Suite Extension is now active');
    
    // Register the command to start Confluence container
    let startDisposable = vscode.commands.registerCommand('confluence-docker.startContainer', async () => {
        try {
            await startConfluenceWithPostgres();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to start Confluence: ${error.message}`);
        }
    });
    
    // Register the command to stop Confluence container
    let stopDisposable = vscode.commands.registerCommand('confluence-docker.stopContainer', async () => {
        try {
            await stopConfluenceWithPostgres();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stop Confluence: ${error.message}`);
        }
    });
    
    // Register the command to check container status
    let statusDisposable = vscode.commands.registerCommand('confluence-docker.containerStatus', async () => {
        try {
            await checkContainersStatus();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check container status: ${error.message}`);
        }
    });

    // Register the command to export code to Confluence
    let exportDisposable = vscode.commands.registerCommand('confluence-docker.exportToConfluence', async () => {
        try {
            await exportCodeToConfluence();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export to Confluence: ${error}`);
        }
    });

    // Register the command to import content from Confluence
    let importDisposable = vscode.commands.registerCommand('confluence-docker.importFromConfluence', async () => {
        try {
            await importFromConfluence();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import from Confluence: ${error}`);
        }
    });

    context.subscriptions.push(
        startDisposable, 
        stopDisposable, 
        statusDisposable, 
        exportDisposable,
        importDisposable
    );
}

// Main function to start both containers
async function startConfluenceWithPostgres() {
    // Check if Docker is installed
    try {
        await executeCommand('docker --version');
    } catch (error) {
        throw new Error('Docker is not installed or not accessible');
    }
    
    // Check if Docker network exists, create if not
    await createDockerNetworkIfNeeded();
    
    // Check if PostgreSQL container exists and is running
    const pgContainerExists = await checkIfContainerExists(PG_CONTAINER_NAME);
    const pgRunning = pgContainerExists ? await isContainerRunning(PG_CONTAINER_NAME) : false;
    
    // Start or create PostgreSQL container
    if (!pgContainerExists) {
        await startPostgresContainer();
    } else if (!pgRunning) {
        await executeCommand(`docker start ${PG_CONTAINER_NAME}`);
        vscode.window.showInformationMessage('PostgreSQL container started.');
    } else {
        vscode.window.showInformationMessage('PostgreSQL container is already running.');
    }
    
    // Wait for PostgreSQL to initialize
    vscode.window.showInformationMessage('Waiting for PostgreSQL to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if Confluence container exists and is running
    const confluenceContainerExists = await checkIfContainerExists(CONTAINER_NAME);
    const confluenceRunning = confluenceContainerExists ? await isContainerRunning(CONTAINER_NAME) : false;
    
    // Start or create Confluence container
    if (!confluenceContainerExists) {
        await startConfluenceContainer();
    } else if (!confluenceRunning) {
        await executeCommand(`docker start ${CONTAINER_NAME}`);
        vscode.window.showInformationMessage('Confluence container started.');
        openConfluenceInBrowser();
    } else {
        vscode.window.showInformationMessage('Confluence container is already running.');
        openConfluenceInBrowser();
    }
}

// Function to create Docker network if needed
async function createDockerNetworkIfNeeded() {
    try {
        await executeCommand(`docker network inspect ${DOCKER_NETWORK}`);
        // Network exists
    } catch (error) {
        // Network doesn't exist, create it
        await executeCommand(`docker network create ${DOCKER_NETWORK}`);
        vscode.window.showInformationMessage(`Created Docker network: ${DOCKER_NETWORK}`);
    }
}

// Function to start PostgreSQL container
async function startPostgresContainer() {
    vscode.window.showInformationMessage('Setting up PostgreSQL container for Confluence...');
    
    // Pull PostgreSQL image if needed
    await executeCommand(`docker pull ${PG_IMAGE}`);
    
    // Start PostgreSQL container
    await executeCommand(
        `docker run -d --name ${PG_CONTAINER_NAME} \
        --network ${DOCKER_NETWORK} \
        -p ${PG_PORT}:5432 \
        -e POSTGRES_USER=${PG_USER} \
        -e POSTGRES_PASSWORD=${PG_PASSWORD} \
        -e POSTGRES_DB=${PG_DB} \
        ${PG_IMAGE}`
    );
    
    vscode.window.showInformationMessage('PostgreSQL container started successfully.');
}

// Function to start Confluence container connected to PostgreSQL
async function startConfluenceContainer() {
    vscode.window.showInformationMessage('Setting up Confluence container...');
    
    // Pull Confluence image if needed
    await executeCommand(`docker pull ${CONFLUENCE_IMAGE}`);
    
    // Start Confluence container with PostgreSQL configuration
    await executeCommand(
        `docker run -d --name ${CONTAINER_NAME} \
        --network ${DOCKER_NETWORK} \
        -p ${HOST_PORT}:${CONTAINER_PORT} \
        -e ATL_JDBC_URL=jdbc:postgresql://${PG_CONTAINER_NAME}:5432/${PG_DB} \
        -e ATL_JDBC_USER=${PG_USER} \
        -e ATL_JDBC_PASSWORD=${PG_PASSWORD} \
        -e ATL_DB_TYPE=postgresql \
        ${CONFLUENCE_IMAGE}`
    );
    
    vscode.window.showInformationMessage('Confluence container started successfully!');
    
    // Open Confluence in the browser
    openConfluenceInBrowser();
}

// Function to stop both Confluence and PostgreSQL containers
async function stopConfluenceWithPostgres() {
    // Check if Confluence container is running
    const confluenceExists = await checkIfContainerExists(CONTAINER_NAME);
    if (confluenceExists) {
        const confluenceRunning = await isContainerRunning(CONTAINER_NAME);
        if (confluenceRunning) {
            await executeCommand(`docker stop ${CONTAINER_NAME}`);
            vscode.window.showInformationMessage('Confluence container stopped.');
        } else {
            vscode.window.showInformationMessage('Confluence container is not running.');
        }
    } else {
        vscode.window.showInformationMessage('Confluence container does not exist.');
    }
    
    // Check if PostgreSQL container is running
    const pgExists = await checkIfContainerExists(PG_CONTAINER_NAME);
    if (pgExists) {
        const pgRunning = await isContainerRunning(PG_CONTAINER_NAME);
        if (pgRunning) {
            await executeCommand(`docker stop ${PG_CONTAINER_NAME}`);
            vscode.window.showInformationMessage('PostgreSQL container stopped.');
        } else {
            vscode.window.showInformationMessage('PostgreSQL container is not running.');
        }
    } else {
        vscode.window.showInformationMessage('PostgreSQL container does not exist.');
    }
}

// Function to check status of both containers
async function checkContainersStatus() {
    // Check PostgreSQL container
    const pgExists = await checkIfContainerExists(PG_CONTAINER_NAME);
    if (pgExists) {
        const pgRunning = await isContainerRunning(PG_CONTAINER_NAME);
        if (pgRunning) {
            vscode.window.showInformationMessage('PostgreSQL container is running.');
            // Get PostgreSQL container info
            const pgInfo = await executeCommand(`docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${PG_CONTAINER_NAME}`);
            vscode.window.showInformationMessage(`PostgreSQL container IP: ${pgInfo}`);
        } else {
            vscode.window.showInformationMessage('PostgreSQL container exists but is not running.');
        }
    } else {
        vscode.window.showInformationMessage('PostgreSQL container does not exist.');
    }
    
    // Check Confluence container
    const confluenceExists = await checkIfContainerExists(CONTAINER_NAME);
    if (confluenceExists) {
        const confluenceRunning = await isContainerRunning(CONTAINER_NAME);
        if (confluenceRunning) {
            vscode.window.showInformationMessage('Confluence container is running.');
            // Get Confluence container info
            const confluenceInfo = await executeCommand(`docker inspect --format='{{.Config.Image}} | {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${CONTAINER_NAME}`);
            vscode.window.showInformationMessage(`Confluence container info: ${confluenceInfo}`);
        } else {
            vscode.window.showInformationMessage('Confluence container exists but is not running.');
        }
    } else {
        vscode.window.showInformationMessage('Confluence container does not exist.');
    }
}

// Function to import content from Confluence
async function importFromConfluence() {
    // Get or set credentials
    if (!confluenceCredentials.username || !confluenceCredentials.password) {
        await getConfluenceCredentials();
    }
    
    // Ask for page ID
    const pageId = await vscode.window.showInputBox({
        prompt: 'Enter the Confluence page ID to import',
        placeHolder: 'e.g., 123456'
    });
    
    if (!pageId) {
        return; // User canceled
    }
    
    try {
        // Get page content with both storage and view formats
        const pageContent = await getConfluencePage(pageId, true);
        
        if (!pageContent) {
            vscode.window.showErrorMessage(`Could not retrieve page with ID: ${pageId}`);
            return;
        }
        
        // Ask user which format they want to import
        const formatOption = await vscode.window.showQuickPick(
            [
                { 
                    label: 'Storage Format', 
                    description: 'Raw Confluence storage format with macros (HTML + Confluence XML)', 
                    format: 'storage' 
                },
                { 
                    label: 'HTML Format', 
                    description: 'Rendered HTML as displayed in browser', 
                    format: 'html' 
                }
            ],
            { placeHolder: 'Select import format' }
        );
        
        if (!formatOption) {
            return; // User canceled
        }
        
        // Get content based on selected format
        let contentToImport;
        
        if (formatOption.format === 'storage') {
            contentToImport = pageContent.body.storage.value;
        } else {
            contentToImport = pageContent.body.view.value;
        }
        
        // Create a new document with the content
        const document = await vscode.workspace.openTextDocument({
            content: contentToImport,
            language: 'html'  // Always treat as HTML for syntax highlighting
        });
        
        await vscode.window.showTextDocument(document);
        
        // Store page metadata in document state for easier re-upload
        await createMetadataFile({
            id: pageContent.id,
            title: pageContent.title,
            spaceKey: pageContent.space.key,
            version: pageContent.version.number,
            format: formatOption.format,
            lastUpdated: new Date().toISOString()
        });
        
        vscode.window.showInformationMessage(`Imported content from page "${pageContent.title}" (ID: ${pageId}) in ${formatOption.label}. Edit and use "Export to Confluence" to update.`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to import from Confluence: ${error.message}`);
    }
}

// Function to create metadata file for the imported content
async function createMetadataFile(pageContent) {
    try {
        // Create temporary directory if it doesn't exist
        const tempDir = path.join(vscode.workspace.rootPath || os.tmpdir(), '.confluence');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Save metadata for easier re-upload
        const metadata = {
            id: pageContent.id,
            title: pageContent.title,
            spaceKey: pageContent.spaceKey,
            version: pageContent.version,
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(
            path.join(tempDir, `page_${pageContent.id}.json`),
            JSON.stringify(metadata, null, 2)
        );
    } catch (error) {
        console.error('Failed to save metadata:', error);
        // Non-critical error, so just log it
    }
}

// Function to export code to Confluence
async function exportCodeToConfluence() {
    // Check if an editor is active
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found. Please open a file first.');
        return;
    }
    
    // Get the text from the active editor
    const documentText = editor.document.getText();
    const fileName = path.basename(editor.document.fileName);
    
    // Get or set credentials
    if (!confluenceCredentials.username || !confluenceCredentials.password) {
        await getConfluenceCredentials();
    }
    
    // Check for existing metadata for this file
    const metadata = await checkForPageMetadata();
    
    // Show options to create a new page or update existing
    let option;
    if (metadata) {
        option = await vscode.window.showQuickPick(
            [
                { 
                    label: `Update existing page "${metadata.title}"`, 
                    description: `Page ID: ${metadata.id}`, 
                    action: 'update',
                    metadata 
                },
                { label: 'Create a new page', description: 'Create a new Confluence page with this content', action: 'create' },
                { label: 'Update another page', description: 'Update a different existing page', action: 'update-other' }
            ],
            { placeHolder: 'Select an action' }
        );
    } else {
        option = await vscode.window.showQuickPick(
            [
                { label: 'Create a new page', description: 'Create a new Confluence page with this content', action: 'create' },
                { label: 'Update existing page', description: 'Update an existing Confluence page with this content', action: 'update-other' }
            ],
            { placeHolder: 'Select an action' }
        );
    }
    
    if (!option) {
        return; // User canceled
    }
    
    let pageId, pageTitle, spaceKey, versionNumber, importFormat;
    
    if (option.action === 'update' && option.metadata) {
        // Use existing metadata
        pageId = option.metadata.id;
        pageTitle = option.metadata.title;
        spaceKey = option.metadata.spaceKey;
        versionNumber = option.metadata.version;
        importFormat = option.metadata.format || 'storage'; // Default to storage if not specified
        
        // Verify page still exists and get latest version
        try {
            const pageInfo = await getConfluencePage(pageId);
            if (!pageInfo) {
                vscode.window.showErrorMessage(`Could not retrieve page with ID: ${pageId}. It may have been deleted.`);
                return;
            }
            versionNumber = pageInfo.version.number;
            
            // Ensure we have the space key
            if (!spaceKey && pageInfo.space && pageInfo.space.key) {
                spaceKey = pageInfo.space.key;
            } else if (!spaceKey) {
                // If we still don't have a space key, ask the user
                spaceKey = await vscode.window.showInputBox({
                    prompt: 'Enter the Confluence space key',
                    placeHolder: 'e.g., DEV, TEAM, etc.'
                });
                
                if (!spaceKey) {
                    return; // User canceled
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to verify page: ${error.message}`);
            return;
        }
    } else if (option.action === 'update-other') {
        // Get page ID
        pageId = await vscode.window.showInputBox({
            prompt: 'Enter the Confluence page ID to update',
            placeHolder: 'e.g., 123456'
        });
        
        if (!pageId) {
            return; // User canceled
        }
        
        // Get page info
        try {
            const pageInfo = await getConfluencePage(pageId);
            if (!pageInfo) {
                vscode.window.showErrorMessage(`Could not retrieve page with ID: ${pageId}`);
                return;
            }
            
            pageTitle = pageInfo.title;
            versionNumber = pageInfo.version.number;
            
            // Check if space key exists in the page info
            if (pageInfo.space && pageInfo.space.key) {
                spaceKey = pageInfo.space.key;
            } else {
                // If space key is missing, ask the user
                spaceKey = await vscode.window.showInputBox({
                    prompt: 'Enter the Confluence space key',
                    placeHolder: 'e.g., DEV, TEAM, etc.'
                });
                
                if (!spaceKey) {
                    return; // User canceled
                }
            }
            
            // Ask for format when updating another page
            importFormat = await promptForExportFormat();
            if (!importFormat) {
                return; // User canceled
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get page info: ${error.message}`);
            return;
        }
    } else {
        // Create new page - get space key
        spaceKey = await vscode.window.showInputBox({
            prompt: 'Enter the Confluence space key',
            placeHolder: 'e.g., DEV, TEAM, etc.'
        });
        
        if (!spaceKey) {
            return; // User canceled
        }
        
        // Get page title
        pageTitle = await vscode.window.showInputBox({
            prompt: 'Enter a title for the new page',
            value: `${fileName}`
        });
        
        if (!pageTitle) {
            return; // User canceled
        }
        
        // For new pages, ask for format
        importFormat = await promptForExportFormat();
        if (!importFormat) {
            return; // User canceled
        }
    }
    
    // Process content based on format
    let processedContent = documentText;
    
    if (importFormat === 'html') {
        // Process HTML to make it compatible with Confluence
        processedContent = `<p>${processedContent}</p>`;
    }
    
    // Determine if we're creating or updating
    if (option.action === 'create') {
        // Create new page
        try {
            const result = await createConfluencePage(spaceKey, pageTitle, processedContent);
            if (result.id) {
                vscode.window.showInformationMessage(`Page created successfully with ID: ${result.id}`);
                
                // Save metadata for future use
                await createMetadataFile({
                    id: result.id,
                    title: pageTitle,
                    spaceKey: spaceKey,
                    version: 1,
                    format: importFormat
                });
                
                // Open the page in browser
                vscode.env.openExternal(vscode.Uri.parse(`${confluenceCredentials.baseUrl}/pages/viewpage.action?pageId=${result.id}`));
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create page: ${error.message}`);
        }
    } else {
        // Update existing page
        try {
            const result = await updateConfluencePage(pageId, pageTitle, spaceKey, processedContent, versionNumber);
            if (result) {
                vscode.window.showInformationMessage(`Page updated successfully: ${pageTitle}`);
                
                // Update metadata for future use
                await createMetadataFile({
                    id: pageId,
                    title: pageTitle,
                    spaceKey: spaceKey,
                    version: versionNumber + 1,
                    format: importFormat
                });
                
                // Open the page in browser
                vscode.env.openExternal(vscode.Uri.parse(`${confluenceCredentials.baseUrl}/pages/viewpage.action?pageId=${pageId}`));
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update page: ${error.message}`);
        }
    }
}

// Function to check for existing page metadata for the current file
async function checkForPageMetadata() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        
        const fileName = path.basename(editor.document.fileName);
        const tempDir = path.join(vscode.workspace.rootPath || os.tmpdir(), '.confluence');
        
        if (!fs.existsSync(tempDir)) {
            return null;
        }
        
        // Read all metadata files
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
            if (file.startsWith('page_') && file.endsWith('.json')) {
                const metadata = JSON.parse(fs.readFileSync(path.join(tempDir, file), 'utf8'));
                return metadata;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Failed to read metadata:', error);
        return null;
    }
}

// Function to get Confluence credentials
async function getConfluenceCredentials() {
    const username = await vscode.window.showInputBox({
        prompt: 'Enter your Confluence username',
        placeHolder: 'username'
    });
    
    if (!username) {
        throw new Error('Username is required');
    }
    
    const password = await vscode.window.showInputBox({
        prompt: 'Enter your Confluence password',
        password: true
    });
    
    if (!password) {
        throw new Error('Password is required');
    }
    
    confluenceCredentials.username = username;
    confluenceCredentials.password = password;
}

// Function to format content for Confluence - with direct storage format support
function formatCodeForConfluence(content) {
    // We need to determine if this is already Confluence storage format or plain HTML
    if (content.includes('ac:structured-macro') || content.includes('ac:plain-text-body')) {
        // This is likely already in Confluence storage format - pass it directly
        return content;
    } else {
        // This is likely plain HTML or text, so wrap it in the appropriate storage format
        // No escaping needed for HTML content
        return `<p>${content}</p>`;
    }
}

// Function to create a new Confluence page
async function createConfluencePage(spaceKey, title, content) {
    // Don't format content that's already properly formatted for Confluence
    let formattedContent = formatCodeForConfluence(content);
    
    const requestBody = JSON.stringify({
        type: 'page',
        title: title,
        space: { key: spaceKey },
        body: {
            storage: {
                value: formattedContent,
                representation: 'storage'
            }
        }
    });
    
    const response = await makeConfluenceApiRequest('/rest/api/content', 'POST', requestBody);
    return response;
}

// Function to get a Confluence page
async function getConfluencePage(pageId, includeBody = false) {
    try {
        const expand = includeBody 
            ? 'version,body.storage,body.view' 
            : 'version';
            
        const response = await makeConfluenceApiRequest(`/rest/api/content/${pageId}?expand=${expand}`, 'GET');
        return response;
    } catch (error) {
        throw new Error(`Failed to get page: ${error.message}`);
    }
}

// Function to update a Confluence page
async function updateConfluencePage(pageId, title, spaceKey, content, versionNumber) {
    // Don't format content that's already properly formatted for Confluence
    let formattedContent = formatCodeForConfluence(content);
    
    const requestBody = JSON.stringify({
        type: 'page',
        title: title,
        space: { key: spaceKey },
        body: {
            storage: {
                value: formattedContent,
                representation: 'storage'
            }
        },
        version: {
            number: versionNumber + 1
        }
    });
    
    const response = await makeConfluenceApiRequest(`/rest/api/content/${pageId}`, 'PUT', requestBody);
    return response;
}

// Helper function to make Confluence API requests
async function makeConfluenceApiRequest(endpoint, method, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: HOST_PORT,
            path: endpoint,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${confluenceCredentials.username}:${confluenceCredentials.password}`).toString('base64')
            }
        };
        
        if (body) {
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                } else {
                    reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`Request error: ${error.message}`));
        });
        
        if (body) {
            req.write(body);
        }
        
        req.end();
    });
}

// Helper function to check if a container exists
async function checkIfContainerExists(containerName) {
    try {
        await executeCommand(`docker inspect ${containerName}`);
        return true;
    } catch (error) {
        return false;
    }
}

// Helper function to check if a container is running
async function isContainerRunning(containerName) {
    try {
        const status = await executeCommand(`docker inspect --format='{{.State.Running}}' ${containerName}`);
        return status.trim() === 'true';
    } catch (error) {
        return false;
    }
}

// Helper function to execute shell commands
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        cp.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

// Function to open Confluence in the default browser
function openConfluenceInBrowser() {
    const url = `http://localhost:${HOST_PORT}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
    vscode.window.showInformationMessage(`Confluence is starting at ${url}. It may take a minute to initialize.`);
}

// This method is called when your extension is deactivated
function deactivate() {
    console.log('Confluence Test Suite extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
};