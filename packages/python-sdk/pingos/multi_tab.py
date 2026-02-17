"""Multi-tab workflow support — manage named tabs for cross-tab operations."""


class MultiTabContext:
    """Manages multiple named browser tabs for cross-tab workflows.

    Usage:
        ctx = MultiTabContext(browser, {
            "sheets": {"url": "https://docs.google.com/spreadsheets/..."},
            "gmail": {"url": "https://mail.google.com"},
        })
        sheets_tab = ctx.get_tab("sheets")
        gmail_tab = ctx.get_tab("gmail")
    """

    def __init__(self, browser, tab_configs):
        """
        Args:
            browser: Browser instance
            tab_configs: dict of {name: {"url": str, "device_id": str (optional)}}
        """
        self.browser = browser
        self.tab_configs = tab_configs
        self.tabs = {}

    def resolve_tab(self, name):
        """Find a tab by name, device_id, or URL pattern.

        Checks in order:
        1. Already-opened tab in self.tabs
        2. Tab config with explicit device_id
        3. Browser.find() by URL pattern

        Returns:
            Tab instance or None if not found.
        """
        # Already tracked
        if name in self.tabs:
            return self.tabs[name]

        config = self.tab_configs.get(name, {})

        # Try explicit device_id
        device_id = config.get('device_id')
        if device_id:
            tab = self.browser.tab(device_id)
            self.tabs[name] = tab
            return tab

        # Try finding by URL pattern
        url = config.get('url', '')
        if url:
            tab = self.browser.find(url)
            if tab:
                self.tabs[name] = tab
                return tab

        return None

    def open_tab(self, name, url=None):
        """Open a new tab by navigating to a URL.

        If url is not provided, uses the URL from tab_configs.

        Returns:
            Tab instance.

        Raises:
            ValueError: If no URL available for this tab name.
        """
        if url is None:
            config = self.tab_configs.get(name, {})
            url = config.get('url')
        if not url:
            raise ValueError(f'No URL configured for tab: {name}')

        # Find any available tab to use for navigation, or use the first device
        devices = self.browser.devices()
        if isinstance(devices, dict):
            if 'extension' in devices:
                device_list = devices.get('extension', {}).get('devices', [])
            else:
                device_list = devices.get('devices', devices.get('tabs', []))
        elif isinstance(devices, list):
            device_list = devices
        else:
            device_list = []

        if not device_list:
            raise RuntimeError('No browser tabs available to open new tab')

        # Use the first available device to navigate
        did = device_list[0].get('deviceId') or device_list[0].get('device_id') or device_list[0].get('id', '')
        tab = self.browser.tab(did)
        tab._op('navigate', url=url)
        tab.url = url
        self.tabs[name] = tab
        return tab

    def get_tab(self, name):
        """Get a tab by name, resolving or auto-opening as needed.

        Tries resolve_tab() first, then opens the tab if a URL is configured.

        Returns:
            Tab instance.

        Raises:
            ValueError: If tab cannot be resolved or opened.
        """
        tab = self.resolve_tab(name)
        if tab:
            return tab

        # Auto-open if URL is configured
        config = self.tab_configs.get(name, {})
        if config.get('url'):
            return self.open_tab(name)

        raise ValueError(f'Tab not found and no URL configured: {name}')
