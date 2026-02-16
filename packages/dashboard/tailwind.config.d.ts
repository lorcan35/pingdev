declare const _default: {
    content: string[];
    theme: {
        extend: {
            colors: {
                bg: string;
                surface: string;
                border: string;
                fg: string;
                muted: string;
                dim: string;
                accent: {
                    green: string;
                    cyan: string;
                };
                health: {
                    healthy: string;
                    degraded: string;
                    offline: string;
                };
            };
            boxShadow: {
                'glow-green': string;
                'glow-cyan': string;
                'glow-amber': string;
                'glow-red': string;
            };
            keyframes: {
                pulseGlow: {
                    '0%, 100%': {
                        opacity: string;
                    };
                    '50%': {
                        opacity: string;
                    };
                };
                floatDot: {
                    '0%': {
                        transform: string;
                    };
                    '100%': {
                        transform: string;
                    };
                };
            };
            animation: {
                pulseGlow: string;
            };
        };
    };
};
export default _default;
//# sourceMappingURL=tailwind.config.d.ts.map