(function () {
    if (window.isTadsInitialized) return;
    window.isTadsInitialized = true;

    let selectedAudioDeviceId = ''; // Variable to store the selected audio device ID
    let autoChangeEnabled = false; // Variable to track if automatic mode is enabled
    let pageChangeTimeout = null; // Variable to manage the global timeout when page changes

    /**
     * Function to set the sink ID for the elements
     * @param {NodeList} elements - The elements to set the sink ID for
     * @param {string} id - The ID to set the sink ID to
     */
    function setElementsSinkId(elements, id) {
        // Use already passed elements instead of querying them again
        elements.forEach(el => {
            if (typeof el.setSinkId === 'function') {
                el.setSinkId(id);
            }
        });
    }

    /**
     * Function to select the audio output.
     * Returns a Promise so the caller (popup) can update its UI if still open.
     * Selection itself never depends on the popup being alive.
     * @param {NodeList} elements - The elements to select the audio output for
     * @returns {Promise<{message: string, deviceId?: string, deviceLabel?: string}>}
     */
    function selectAudioOutput(elements) {
        if (!navigator.mediaDevices.selectAudioOutput) {
            console.error('[TADS] setSinkId option is not enabled!');
            console.warn('[TADS] You need to enable "media.setsinkid.enabled" in the about:config settings!');
            return Promise.resolve({ message: 'SetSinkIdError' });
        }

        return navigator.mediaDevices.selectAudioOutput()
            .then(output => {
                console.debug('[TADS] Selected device:', output);

                selectedAudioDeviceId = output.deviceId;
                setElementsSinkId(elements, output.deviceId);

                // Add event listeners if auto mode is enabled
                if (autoChangeEnabled) {
                    addMediaEventListeners(elements);
                }

                return {
                    message: 'DeviceSelected',
                    deviceId: output.deviceId,
                    deviceLabel: output.label
                };
            })
            .catch(err => {
                if (err.name === 'InvalidStateError') {
                    console.error('[TADS] User interaction required before accessing audio devices');
                    console.warn('[TADS] Click anywhere on the page before trying again');
                    return { message: 'InvalidStateError' };
                }

                if (err.name === 'NotAllowedError') {
                    // User cancelled the system picker or denied access — not an error for the UI
                    console.error('[TADS] Audio device selection was denied by system or user');
                    return { message: 'NotAllowedError' };
                }

                console.error(`[TADS][ERROR] ${err.name}: ${err.message}`);
                return { message: err.name };
            });
    }

    /**
     * Function to add event listeners to media elements
     * @param {NodeList} elements - The elements to add event listeners to
     */
    function addMediaEventListeners(elements) {
        elements.forEach(el => {
            // First, make sure not to add duplicates by removing existing listeners
            removeMediaEventListeners([el]);

            // Add an attribute to mark that the element is already managed
            el.setAttribute('data-tads-managed', 'true');

            // Add listeners for different media events
            el.addEventListener('play', handleMediaEvent);
            el.addEventListener('canplay', handleMediaEvent);
            el.addEventListener('loadeddata', handleMediaEvent);
        });
    }

    /**
     * Function to remove event listeners from media elements
     * @param {NodeList} elements - The elements to remove event listeners from
     */
    function removeMediaEventListeners(elements) {
        elements.forEach(el => {
            if (el.getAttribute('data-tads-managed') === 'true') {
                el.removeEventListener('play', handleMediaEvent);
                el.removeEventListener('canplay', handleMediaEvent);
                el.removeEventListener('loadeddata', handleMediaEvent);
                el.removeAttribute('data-tads-managed');
            }
        });
    }

    /**
     * Event handler for media events
     * @param {Event} event - The event to handle
     */
    function handleMediaEvent(event) {
        if (autoChangeEnabled && selectedAudioDeviceId) {
            const element = event.target;
            console.log(`[TADS] Media event '${event.type}' detected on element:`, element);

            // Instead of applying directly, use the retry function
            applyDeviceWithRetry(element);
        }
    }

    /**
     * Function to apply the device with multiple retry attempts
     * @param {Element} element - The element to apply the device to
     * @param {number} attempts - The number of attempts made
     */
    function applyDeviceWithRetry(element, attempts = 0) {
        const maxAttempts = 5;
        const retryDelay = 200; // milliseconds

        if (attempts >= maxAttempts) {
            console.warn(`[TADS] Failed to apply device after ${maxAttempts} attempts`);
            return;
        }

        // Check if the element is ready to receive a setSinkId
        const isReady = !element.paused ||
            element.readyState >= 2 || // HAVE_CURRENT_DATA or higher
            element.hasAttribute('data-tads-ready');

        if (isReady && typeof element.setSinkId === 'function') {
            element.setSinkId('') // Reset the sink ids before to avoid a bug with Firefox!
                .then(() => {
                    element.setSinkId(selectedAudioDeviceId) // Apply the selected audio device
                })
                .then(() => {
                    console.debug(`[TADS] Successfully applied audio device after ${attempts} attempts`);
                    element.setAttribute('data-tads-ready', 'true');
                })
                .catch(err => {
                    console.error(`[TADS] Failed to set sink ID: ${err}`);
                    // Retry after a delay
                    setTimeout(() => applyDeviceWithRetry(element, attempts + 1), retryDelay);
                });
        } else {
            // Element is not ready yet, retry after a delay
            console.debug(`[TADS] Element not ready yet, attempt ${attempts + 1}/${maxAttempts}`);
            setTimeout(() => applyDeviceWithRetry(element, attempts + 1), retryDelay);
        }
    }

    /**
     * Function to apply the selected audio device to new media elements
     */
    function applySelectedAudioDevice() {
        if (autoChangeEnabled && selectedAudioDeviceId) {
            const elements = document.querySelectorAll('audio, video');
            if (elements.length) {
                // First reset the audio output
                setElementsSinkId(elements, '');

                // Apply the selected device to each element with multiple retry attempts
                Array.from(elements).forEach(element => {
                    // Add event listeners to detect when the element becomes ready
                    addMediaEventListeners([element]);

                    // Start application attempts immediately
                    applyDeviceWithRetry(element);
                });

                console.debug('[TADS] Started applying selected audio device to elements');
            }
        }
    }

    /**
     * Function to set up detection for page changes
     */
    function setupDetection() {
        console.log('[TADS] Setting up detection for page changes');

        // 1. Observe URL changes
        let lastUrl = location.href;
        let urlChangeMonitor = null;

        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                console.log('[TADS] URL changed, checking for media elements...');

                // Cancel any existing timeout
                if (pageChangeTimeout) {
                    clearTimeout(pageChangeTimeout);
                }

                // Stop previous monitor if it exists
                if (urlChangeMonitor) {
                    clearInterval(urlChangeMonitor);
                    urlChangeMonitor = null;
                }

                // Set a global timeout to stop observation if no elements are found
                pageChangeTimeout = setTimeout(() => {
                    console.log('[TADS] Page change timeout reached, stopping observation');
                    if (urlChangeMonitor) {
                        clearInterval(urlChangeMonitor);
                        urlChangeMonitor = null;
                    }
                    pageChangeTimeout = null;
                }, 10000); // 10 seconds maximum timeout

                // Periodically search for media elements until found or timeout is reached
                urlChangeMonitor = setInterval(() => {
                    const elements = document.querySelectorAll('audio, video');
                    if (elements.length) {
                        console.log('[TADS] Media elements found during polling, count:', elements.length);
                        applySelectedAudioDevice();

                        // Cleanup after finding elements
                        clearInterval(urlChangeMonitor);
                        urlChangeMonitor = null;

                        if (pageChangeTimeout) {
                            clearTimeout(pageChangeTimeout);
                            pageChangeTimeout = null;
                        }
                    }
                }, 500); // Check every 500ms
            }
        }).observe(document, { subtree: true, childList: true });

        // 2. Observe DOM changes to detect new media elements
        new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    // Check if audio/video elements have been added
                    const hasNewMediaElements = Array.from(mutation.addedNodes).some(node => {
                        return (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') ||
                            (node.querySelectorAll && node.querySelectorAll('video, audio').length > 0);
                    });

                    if (hasNewMediaElements && autoChangeEnabled && selectedAudioDeviceId) {
                        console.log('[TADS] New media elements detected');

                        // Get all current media elements
                        const elements = document.querySelectorAll('audio, video');

                        // Filter to process only new elements that aren't already managed
                        const newElements = Array.from(elements).filter(
                            el => !el.hasAttribute('data-tads-managed') && !el.hasAttribute('data-tads-ready')
                        );

                        if (newElements.length > 0) {
                            console.log('[TADS] Processing new media elements, count:', newElements.length);
                            newElements.forEach(element => {
                                // Mark the element
                                element.setAttribute('data-tads-managed', 'true');

                                // Add event listeners
                                addMediaEventListeners([element]);

                                // Start trying to apply the device
                                applyDeviceWithRetry(element);
                            });
                        }
                        break;
                    }
                }
            }
        }).observe(document, { childList: true, subtree: true });
    }

    // Handle messages from the extension (popup). All replies go through the returned Promise
    // so nothing breaks if the popup closes before the operation finishes.
    browser.runtime.onMessage.addListener(message => {
        // Status can be queried even when there are no media elements yet
        if (message.command === 'getStatus') {
            return Promise.resolve({
                autoChangeEnabled: autoChangeEnabled,
                hasSelectedDevice: !!selectedAudioDeviceId
            });
        }

        let elements = document.querySelectorAll('audio, video');
        if (!elements.length) {
            return Promise.resolve({ message: 'NoElementsError' });
        }

        if (message.command === 'select') {
            return selectAudioOutput(elements);
        }

        if (message.command === 'reset') {
            selectedAudioDeviceId = '';
            autoChangeEnabled = false;
            setElementsSinkId(elements, '');
            removeMediaEventListeners(elements);
            return Promise.resolve({ message: 'Reset' });
        }

        if (message.command === 'toggleAutoChange') {
            autoChangeEnabled = message.enabled;

            if (autoChangeEnabled && selectedAudioDeviceId) {
                addMediaEventListeners(elements);
            } else {
                removeMediaEventListeners(elements);
            }

            return Promise.resolve({ autoChangeEnabled: autoChangeEnabled });
        }
    });

    // Set up detection for all sites
    console.log('[TADS] Setting up media elements detection');
    setupDetection();
})();