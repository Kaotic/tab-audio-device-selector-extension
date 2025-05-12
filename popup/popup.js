/**
 * Function to execute the script, generate listeners, handle errors
 */
function tabEntry() {
    let autoChangeEnabled = false; // Variable to track if automatic mode is enabled
    let hasSelectedDevice = false; // Variable to track if a device is selected

    // Listener for device selection and error messages
    browser.runtime.onMessage.addListener(handleMessages);

    // Get current state
    browser.tabs.query({ active: true, currentWindow: true })
        .then(tabs => {
            return browser.tabs.sendMessage(tabs[0].id, { command: "getStatus" });
        })
        .then(response => {
            if (response) {
                autoChangeEnabled = response.autoChangeEnabled;
                hasSelectedDevice = response.hasSelectedDevice;
                updateAutoChangeButton();
            }
        })
        .catch(err => {
            console.error(`[TADS] ${err}`);
        });

    /**
     * Function to handle messages from the extension
     * @param {Object} message - The message from the extension
     */
    function handleMessages(message) {
        if (message.message === 'DeviceSelected') {
            hasSelectedDevice = true;
            updateAutoChangeButton();
        } else {
            reportError(message);
        }
    }

    /**
     * Function to update the appearance of the auto-change button
     */
    function updateAutoChangeButton() {
        const button = document.getElementsByClassName('btn-auto-change')[0];
        const textSpan = document.getElementById('auto-change-text');

        if (autoChangeEnabled) {
            button.classList.add('active');
            textSpan.textContent = 'Disable automatic switching';
        } else {
            button.classList.remove('active');
            textSpan.textContent = 'Enable automatic switching';
        }

        // Enable/disable the button based on whether a device is selected
        button.disabled = !hasSelectedDevice;
    }

    document.addEventListener('click', (el) => {
        function reportError(err) {
            console.error(`[TADS] ${err}`);
        }

        function buttonSelect(tabs) {
            browser.tabs.sendMessage(tabs[0].id, { command: "select" });
        }

        function buttonReset(tabs) {
            browser.tabs.sendMessage(tabs[0].id, { command: "reset" });
            hasSelectedDevice = false;
            autoChangeEnabled = false;
            updateAutoChangeButton();
        }

        function toggleAutoChange(tabs) {
            if (!hasSelectedDevice) {
                document.querySelector('#error-message-no-device-selected').classList.remove('hidden');
                return;
            }

            // Toggle state
            autoChangeEnabled = !autoChangeEnabled;

            // Update interface
            updateAutoChangeButton();

            // Send command to the content script
            browser.tabs.sendMessage(tabs[0].id, {
                command: "toggleAutoChange",
                enabled: autoChangeEnabled
            });
        }

        // Determine which action to perform based on the clicked element
        let actionTarget = el.target;

        // If clicking on an icon or text inside a button, target the parent button
        while (actionTarget && !actionTarget.classList.contains('button') && actionTarget !== document.body) {
            actionTarget = actionTarget.parentElement;
        }

        // If the clicked element is a button, perform the corresponding action
        if (actionTarget && actionTarget.classList.contains('btn-select')) {
            browser.tabs.query({ active: true, currentWindow: true })
                .then(buttonSelect)
                .catch(reportError);
        }
        else if (actionTarget && actionTarget.classList.contains('btn-reset')) {
            browser.tabs.query({ active: true, currentWindow: true })
                .then(buttonReset)
                .catch(reportError);
        }
        else if (actionTarget && actionTarget.classList.contains('btn-auto-change')) {
            browser.tabs.query({ active: true, currentWindow: true })
                .then(toggleAutoChange)
                .catch(reportError);
        }
    });
}

/**
 * Function to report an error
 * @param {Object} err - The error to report
 */
function reportError(err) {
    document.querySelectorAll('.error-messages > div').forEach(div => {
        div.classList.add('hidden');
    });

    // Display the appropriate error message
    switch (err.message) {
        case 'SetSinkIdError':
            document.querySelector('#error-message-setsinkid').classList.remove('hidden');
            break;
        case 'InvalidStateError':
            document.querySelector('#error-message-need-interaction').classList.remove('hidden');
            break;
        case 'NoElementsError':
            document.querySelector('#error-message-no-elements').classList.remove('hidden');
            break;
        default:
            document.querySelector('#error-unknown').classList.remove('hidden');
            document.querySelector('#error-unknown-logs').textContent = err.message;
    }
}

// Execute the script, generate listeners, handle errors
browser.tabs.executeScript({ file: "/content_scripts/content.js" })
    .then(tabEntry)
    .catch(reportError);