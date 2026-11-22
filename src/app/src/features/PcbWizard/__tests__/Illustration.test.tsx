import { fireEvent, render, screen } from '@testing-library/react';

// the dialog reads an accessibility preference from the store
jest.mock('app/hooks/useTypedSelector', () => ({ useTypedSelector: () => ({ focusTrapping: false }) }));

import Illustration, { PICTURES } from '../components/Illustration';

describe('Illustration', () => {
    it('shows the pictures with captions and enlarges one on click', () => {
        render(<Illustration pictures={[PICTURES.zeroXY, PICTURES.zeroZ]} />);
        expect(screen.getByText('X0 Y0: lower-left corner')).toBeTruthy();
        expect(screen.getByText('Z0: clips on bit and copper')).toBeTruthy();

        fireEvent.click(screen.getByTitle(/Z0: clips on bit and copper/));
        // the caption is now also the dialog title, with the picture full size
        expect(screen.getAllByText('Z0: clips on bit and copper')).toHaveLength(2);
        expect(screen.getAllByAltText('Z0: clips on bit and copper')).toHaveLength(2);
    });
});
