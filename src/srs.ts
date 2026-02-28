export interface SRSData {
    interval: number;
    repetition: number;
    easinessFactor: number;
}

export const calculateNextSRSDelay = (
    rating: 0 | 1 | 2 | 3 | 4 | 5, // 0:Blackout, 1:Wrong(remembered), 2:Wrong(easy), 3:Hard, 4:Good, 5:Easy
    current: SRSData
): SRSData & { nextReviewDate: number } => {
    let { interval, repetition, easinessFactor } = current;

    // Use the SM-2 Quality scale directly
    let q = rating;

    // SM-2 Interval & Repetition updates
    if (q < 3) {
        repetition = 0;
        interval = 1;
    } else {
        if (repetition === 0) {
            interval = 1;
        } else if (repetition === 1) {
            interval = 6;
        } else {
            interval = Math.round(interval * easinessFactor);
        }
        repetition += 1;
    }

    // SM-2 Easiness Factor update
    easinessFactor = easinessFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easinessFactor < 1.3) easinessFactor = 1.3;

    const nextReviewDate = Date.now() + (interval * 24 * 60 * 60 * 1000);

    return { interval, repetition, easinessFactor, nextReviewDate };
};
