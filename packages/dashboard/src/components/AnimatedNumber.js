import { animate, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useLayoutEffect, useState } from 'react';
export function AnimatedNumber({ value, className, duration = 0.45, }) {
    const mv = useMotionValue(value);
    const rounded = useTransform(mv, (latest) => Math.round(latest));
    const [rendered, setRendered] = useState(String(value));
    useEffect(() => {
        const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
        return () => controls.stop();
    }, [duration, mv, value]);
    useLayoutEffect(() => {
        setRendered(String(value));
        const unsub = rounded.on('change', (v) => setRendered(String(v)));
        return () => unsub();
    }, [rounded, value]);
    return <span className={className}>{rendered}</span>;
}
//# sourceMappingURL=AnimatedNumber.js.map