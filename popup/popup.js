/**
 * Function to execute the script, generate listeners, handle errors
 */
function tabEntry() {
    let autoChangeEnabled = false; // Variable to track if automatic mode is enabled
    let hasSelectedDevice = false; // Variable to track if a device is selected

    // Get current state from the content script (source of truth lives in the tab)
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
     * Handle a response from the content script, if the popup is still open.
     * @param {Object} response
     */
    function handleContentResponse(response) {
        if (!response) return;

        if (response.message === 'DeviceSelected') {
            hasSelectedDevice = true;
            updateAutoChangeButton();
            return;
        }

        if (response.message === 'NotAllowedError' || response.message === 'Reset') {
            // Cancelled picker / reset — nothing to show in the error panel
            return;
        }

        if (response.message) {
            reportError(response);
        }
    }

    /**
     * Function to update the appearance of the auto-change button
     */
    function updateAutoChangeButton() {
        const button = document.getElementsByClassName('btn-auto-change')[0];
        const controls = document.getElementsByClassName('auto-change-controls')[0];
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
        controls.classList.toggle('is-disabled', !hasSelectedDevice);
        controls.classList.toggle('is-active', autoChangeEnabled);
    }

    document.addEventListener('click', (el) => {
        function reportClickError(err) {
            // Popup may have been closed while waiting, ignore dead connection noise
            if (err && /Receiving end does not exist|Could not establish connection/i.test(String(err))) {
                console.debug('[TADS] Popup closed while waiting for response');
                return;
            }
            console.error(`[TADS] ${err}`);
        }

        function buttonSelect(tabs) {
            browser.tabs.sendMessage(tabs[0].id, { command: "select" })
                .then(handleContentResponse)
                .catch(reportClickError);
        }

        function buttonReset(tabs) {
            browser.tabs.sendMessage(tabs[0].id, { command: "reset" })
                .then(() => {
                    hasSelectedDevice = false;
                    autoChangeEnabled = false;
                    updateAutoChangeButton();
                })
                .catch(reportClickError);
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
            }).catch(reportClickError);
        }

        function toggleAutoChangeInfo() {
            const info = document.getElementById('auto-change-info');
            const infoButton = document.getElementsByClassName('btn-auto-info')[0];
            const isHidden = info.classList.toggle('hidden');

            infoButton.classList.toggle('active', !isHidden);
            infoButton.setAttribute('aria-expanded', String(!isHidden));
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
                .catch(reportClickError);
        }
        else if (actionTarget && actionTarget.classList.contains('btn-reset')) {
            browser.tabs.query({ active: true, currentWindow: true })
                .then(buttonReset)
                .catch(reportClickError);
        }
        else if (actionTarget && actionTarget.classList.contains('btn-auto-info')) {
            toggleAutoChangeInfo();
        }
        else if (actionTarget && actionTarget.classList.contains('btn-auto-change')) {
            browser.tabs.query({ active: true, currentWindow: true })
                .then(toggleAutoChange)
                .catch(reportClickError);
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
