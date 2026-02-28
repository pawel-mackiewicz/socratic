import { describe, it, expect } from 'vitest';
import { calculateNextSRSDelay, type SRSData } from './srs';

// SM-2 Algorithm mapping (6 buttons -> Qualities 0-5):
// Button 1 (Blackout) -> Quality 0
// Button 2 (Wrong, but remembered) -> Quality 1
// Button 3 (Wrong, but easy to remember) -> Quality 2
// Button 4 (Hard) -> Quality 3
// Button 5 (Good) -> Quality 4
// Button 6 (Easy) -> Quality 5

describe('Strict SM-2 Algorithm', () => {
    const newCard: SRSData = {
        interval: 0,
        repetition: 0,
        easinessFactor: 2.5
    };

    describe('First Repetition (Brand New Card)', () => {
        it('Quality 0 (Blackout): reps=0, interval=1, EF drops to 1.7', () => {
            const result = calculateNextSRSDelay(0, newCard); // q=0
            expect(result.repetition).toBe(0);
            expect(result.interval).toBe(1);
            // EF = 2.5 + (0.1 - 5 * (0.08 + 5 * 0.02)) = 1.7
            expect(result.easinessFactor).toBeCloseTo(1.7, 2);
        });

        it('Quality 1: reps=0, interval=1, EF drops to 1.96', () => {
            const result = calculateNextSRSDelay(1, newCard); // q=1
            expect(result.repetition).toBe(0);
            expect(result.interval).toBe(1);
            // EF = 2.5 + (0.1 - 4 * (0.08 + 4 * 0.02)) = 2.5 - 0.54 = 1.96
            expect(result.easinessFactor).toBeCloseTo(1.96, 2);
        });

        it('Quality 2: reps=0, interval=1, EF drops to 2.18', () => {
            const result = calculateNextSRSDelay(2, newCard); // q=2
            expect(result.repetition).toBe(0);
            expect(result.interval).toBe(1);
            // EF = 2.5 + (0.1 - 3 * (0.08 + 3 * 0.02)) = 2.5 - 0.32 = 2.18
            expect(result.easinessFactor).toBeCloseTo(2.18, 2);
        });

        it('Quality 3 (Hard): reps=1, interval=1, EF drops to 2.36', () => {
            const result = calculateNextSRSDelay(3, newCard); // q=3
            expect(result.repetition).toBe(1);
            expect(result.interval).toBe(1);
            // EF = 2.5 + (0.1 - 2 * (0.08 + 2 * 0.02)) = 2.36
            expect(result.easinessFactor).toBeCloseTo(2.36, 2);
        });

        it('Quality 4 (Good): reps=1, interval=1, EF stable at 2.5', () => {
            const result = calculateNextSRSDelay(4, newCard); // q=4
            expect(result.repetition).toBe(1);
            expect(result.interval).toBe(1);
            expect(result.easinessFactor).toBeCloseTo(2.5, 2);
        });

        it('Quality 5 (Easy): reps=1, interval=1, EF increases to 2.6', () => {
            const result = calculateNextSRSDelay(5, newCard); // q=5
            expect(result.repetition).toBe(1);
            expect(result.interval).toBe(1);
            expect(result.easinessFactor).toBeCloseTo(2.6, 2);
        });
    });

    describe('Second Repetition', () => {
        const cardWithOneRep: SRSData = {
            interval: 1,
            repetition: 1,
            easinessFactor: 2.5
        };

        it('Quality 4 (Good -> Button 5): reps=2, interval=6', () => {
            const result = calculateNextSRSDelay(4, cardWithOneRep);
            expect(result.repetition).toBe(2);
            expect(result.interval).toBe(6);
        });
    });

    describe('Third+ Repetitions', () => {
        const establishedCard: SRSData = {
            interval: 6,
            repetition: 2,
            easinessFactor: 2.5
        };

        it('Quality 4 (Good -> Button 5): reps=3, interval=I(n-1) * EF', () => {
            const result = calculateNextSRSDelay(4, establishedCard);
            expect(result.repetition).toBe(3);
            // 6 * 2.5 = 15
            expect(result.interval).toBe(15);
        });

        it('Quality 0 (Blackout -> Button 1): drops reps to 0, interval to 1', () => {
            const result = calculateNextSRSDelay(0, establishedCard);
            expect(result.repetition).toBe(0);
            expect(result.interval).toBe(1);
        });
    });

    describe('EF constraints', () => {
        it('EF never drops below 1.3', () => {
            const badCard: SRSData = {
                interval: 10,
                repetition: 3,
                easinessFactor: 1.3
            };
            const result = calculateNextSRSDelay(0, badCard); // q=0
            expect(result.easinessFactor).toBe(1.3);
        });
    });
});
