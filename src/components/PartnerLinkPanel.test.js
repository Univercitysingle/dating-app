import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PartnerLinkPanel from './PartnerLinkPanel';
import apiClient from '../api/apiClient';

jest.mock('../api/apiClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn()
}));

jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('PartnerLinkPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads invitations and allows the invited member to accept or decline', async () => {
    apiClient.get.mockResolvedValue({
      links: [{
        id: '123456789012345678901234',
        status: 'pending',
        inviterUid: 'member-a',
        inviteeUid: 'member-b',
        isIncoming: true
      }]
    });

    render(<PartnerLinkPanel />);

    expect(await screen.findByText('Invitation received')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();

    apiClient.patch.mockResolvedValue({ status: 'accepted' });
    apiClient.get.mockResolvedValue({ links: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/users/me/partner-link', {
      action: 'accept',
      linkId: '123456789012345678901234'
    }));
  });

  it('allows a member to invite the profile currently being viewed', async () => {
    apiClient.post.mockResolvedValue({ status: 'pending' });
    render(<PartnerLinkPanel targetUid="member-target" />);

    fireEvent.click(screen.getByRole('button', { name: 'Invite to partner link' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/users/me/partner-link', {
      targetUid: 'member-target'
    }));
  });

  it('does not show accept or decline controls for an outgoing invitation', async () => {
    apiClient.get.mockResolvedValue({
      links: [{
        id: '123456789012345678901234',
        status: 'pending',
        inviterUid: 'member-a',
        inviteeUid: 'member-b',
        isIncoming: false
      }]
    });

    render(<PartnerLinkPanel />);

    expect(await screen.findByText('Invitation sent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
  });
});
