export const navigateToDisclaimer = () => {
  cy.viewport('macbook-13');
  cy.visit('/');
  cy.getWithCustomTimeout('.disclaimer').should('exist');
  cy.contains('Disclaimer');
};

export const navigateToSelectHub = () => {
  cy.getWithCustomTimeout('.no-tokens__add').should('exist');
  cy.get('.no-tokens__add').click();
  cy.getWithCustomTimeout('.token-list-item').eq(0).should('exist');
  cy.get('.token-list-item').eq(0).click();
  cy.getWithCustomTimeout('.tokens-list-item').should('not.exist');
  cy.contains('Select Hub');
};

export const navigateToNotificationPanel = () => {
  cy.get('.app-header__notifications-button').click();
  cy.getWithCustomTimeout('#notification-panel').should('exist');
};

export const navigateToAccountMenu = () => {
  cy.get('.app-header__icons__identicon').click();
  cy.getWithCustomTimeout('.account-root').should('exist');
}

export const navigateToBackupState = () => {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(3).click();
  cy.getWithCustomTimeout('.backup-state').should('exist');
}

export const navigateToTokenSelect = () => {
  // TODO: Find a wau to combine this connect code with the initial connect code.
  cy.getWithCustomTimeout('.home').should('exist');
  cy.get('.home__connect-button').click();
  cy.getWithCustomTimeout('.home').should('not.exist');

  cy.getWithCustomTimeout('.transfer-inputs').should('exist');
  cy.get('.transfer-menus__token-select').click();
  cy.getWithCustomTimeout('.token-overlay').should('exist');
}

export const navigateToConnectNewToken = () => {
  cy.get('.token-overlay__connect-new').should('exist');
  cy.get('.token-overlay__connect-new').click();
  cy.getWithCustomTimeout('.token-list').should('exist');
}

export const navigateBackToTransferScreen = () => {
  cy.get('.app-header__back-button').click();
  cy.getWithCustomTimeout('.transfer-inputs').should('exist');
}

export const navigateToTokenDeposit = () => {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.transfer-menus__dot-menu__button').click();
  cy.getWithCustomTimeout('.transfer-menus__dot-menu__menu__deposit').should('exist');
  cy.get('.transfer-menus__dot-menu__menu__deposit').click();
  cy.getWithCustomTimeout('.channel-deposit').should('exist');
}

export const navigateToChannelsList = () => {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.transfer-menus__dot-menu__button').click();
  cy.getWithCustomTimeout('.transfer-menus__dot-menu__menu__channels').should('exist');
  cy.get('.transfer-menus__dot-menu__menu__channels').click();
  cy.getWithCustomTimeout('.channel-list').should('exist')
}

export const navigateToRaidenAccount = () => {
  navigateToAccountMenu();
  cy.get('.account-content__menu__list-items__icon__button').eq(0).click();
  cy.getWithCustomTimeout('.raiden-account').should('exist');
}

export const navigateToWithdrawal = () => {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(1).click();
  cy.getWithCustomTimeout('.withdrawal__tokens').should('exist');
  cy.get('.withdrawal__tokens__button').eq(0).click();
}

export const navigateToUDC = () => {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(2).click();
  cy.getWithCustomTimeout('.udc').should('exist');
}

export const navigateToDownloadLogs = () => {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(4).click()
}