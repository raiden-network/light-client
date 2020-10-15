export function navigateToDisclaimer() {
  cy.visit('/');
  cy.getWithCustomTimeout('.disclaimer').should('exist');
  cy.contains('Disclaimer');
}

export function navigateToSelectHub() {
  cy.get('.no-tokens__add').should('exist');
  cy.get('.no-tokens__add').click();
  cy.getWithCustomTimeout('.token-list-item').eq(0).should('exist');
  cy.get('.token-list-item').eq(0).click();
  cy.getWithCustomTimeout('.select-hub').should('exist');
  cy.contains('Select Hub');
}

export function navigateToNotificationPanel() {
  cy.get('.app-header__notifications-button').click();
  cy.getWithCustomTimeout('#notification-panel').should('exist');
}

export function navigateToAccountMenu() {
  cy.get('.app-header__icons__identicon').click();
  cy.getWithCustomTimeout('.account-root').should('exist');
}

export function navigateToBackupState() {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(3).click();
  cy.getWithCustomTimeout('.backup-state').should('exist');
}

export function navigateToTokenSelect() {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.transfer-menus__token-select').click();
}

export function navigateToConnectNewTokenFromTokenOverlay() {
  cy.getWithCustomTimeout('.token-overlay__connect-new').should('exist');
  cy.get('.token-overlay__connect-new').click();
  cy.getWithCustomTimeout('.token-list').should('exist');
  cy.contains('Select Token');
}

export function navigateBackToTransferScreenFromOverlay() {
  cy.get('.app-header__back-button').click();
  cy.getWithCustomTimeout('.transfer-inputs').should('exist');
}

export function navigateToTokenDepositFromTransferScreen() {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.transfer-menus__dot-menu__button').click();
  cy.getWithCustomTimeout('.transfer-menus__dot-menu__menu__deposit').should(
    'exist'
  );
  cy.get('.transfer-menus__dot-menu__menu__deposit').click();
  cy.getWithCustomTimeout('.channel-deposit').should('exist');
}

export function navigateToChannelsList() {
  cy.get('.transfer-inputs').should('exist');
  cy.get('.transfer-menus__dot-menu__button').click();
  cy.getWithCustomTimeout('.transfer-menus__dot-menu__menu__channels').should(
    'exist'
  );
  cy.get('.transfer-menus__dot-menu__menu__channels').click();
  cy.getWithCustomTimeout('.channel-list').should('exist');
}

export function navigateToRaidenAccount() {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(0).click();
  cy.getWithCustomTimeout('.raiden-account').should('exist');
}

export function navigateBackToAccountMenu() {
  cy.get('.account-route__header__content__back__button').click();
  cy.getWithCustomTimeout('.account-root').should('exist');
}

export function navigateToWithdrawal() {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(1).click();
  cy.getWithCustomTimeout('.withdrawal__tokens').should('exist');
}

export function navigateToUDC() {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(2).click();
  cy.getWithCustomTimeout('.udc').should('exist');
}

export function navigateToDownloadLogs() {
  cy.get('.account-root').should('exist');
  cy.get('.account-content__menu__list-items__icon__button').eq(4).click();
}
