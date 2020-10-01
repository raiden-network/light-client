export const acceptDisclaimer = () => {
  cy.get('.disclaimer__accept-checkbox').click();
  cy.get('.disclaimer__persist-checkbox').click();
  cy.get('.disclaimer__accept-button').click();
  cy.getWithCustomTimeout('.disclaimer').should('not.exist');
};

export const connectToDApp = () => {
  cy.getWithCustomTimeout('.home').should('exist');
  cy.get('.home__connect-button').click();
  cy.getWithCustomTimeout('.connect__button').should('exist');
  cy.get('.connect__button').click();
  cy.getWithCustomTimeout('.home').should('not.exist');
};

export const enterAndSelectHub = () => {
  cy.get('.address-input').type('0xCBC49ec22c93DB69c78348C90cd03A323267db86');
  cy.wait(2000);
  cy.get('.select-hub__button').click();
  cy.getWithCustomTimeout('.select-hub__button').should('not.exist');
};

export const enterChannelDepositAmount = () => {
  cy.getWithCustomTimeout('.open-channel').should('exist');
  cy.contains('Open Channel');
  cy.get('.amount-input').type('0.5');
  cy.wait(2000);
};

export const deleteTopNotification = () => {
  cy.getWithCustomTimeout('.notification-card__delete-button')
    .eq(0)
    .should('exist');
  cy.get('.notification-card__delete-button').eq(0).click();
};

export const closeNotificationPanel = () => {
  cy.get('.notification-panel-content__close__button').should('exist');
  cy.get('.notification-panel-content__close__button').click();
  cy.getWithCustomTimeout('#notification-panel').should('not.exist');
}

export const enterTransferAddress = () => {
  cy.getWithCustomTimeout('.transfer-inputs').should('exist');
  cy.get('.address-input').type('0xCBC49ec22c93DB69c78348C90cd03A323267db86');
  cy.wait(2000);
}

export const enterTransferAmount = () => {
  cy.getWithCustomTimeout('.transfer-inputs').should('exist');
  cy.get('.amount-input').type('0.0001');
  cy.wait(2000);
}

export const makeDirectTransfer = () => {
  cy.getWithCustomTimeout('.transfer-inputs__form__button').should('exist');
  cy.get('.transfer-inputs__form__button').click();
  cy.wait(2000)
  cy.getWithCustomTimeout('.transfer__button').should('exist');
  cy.get('.transfer__button').click();
  cy.getWithCustomTimeout('.transfer-inputs').should('exist');
}

export const downloadState = () => {
  cy.getWithCustomTimeout('.backup-state__buttons__download-state').should('exist');
  cy.get('.backup-state__buttons__download-state').click();
  cy.getWithCustomTimeout('.download-state__button').should('exist');
  cy.get('.download-state__button').click();
}

export const depositTokensToOpenedChannel = () => {
  cy.get('.channel-deposit').should('exist');
  cy.get('.channel-deposit__input').type('001');
  cy.wait(2000);
  cy.get('.channel-deposit__button').click();
  cy.getWithCustomTimeout('.channel-deposit').should('not.exist');
}

export const withdrawTokens = () => {
  cy.get('.channel-list').should('exist')
  cy.get('.channel-action-button').eq(1).click();
  cy.getWithCustomTimeout('.channel-withdraw').should('exist');
  cy.get('.channel-withdraw__input').type('001');
  cy.get('.channel-withdraw__button').click();
  cy.getWithCustomTimeout('.channel-withdraw').should('not.exist');
}

export const withdrawUDCTokens = () => {
  cy.get('.udc').should('exist');
  cy.get('.udc__actions__button').eq(1).click();
  cy.get('.udc-withdrawal-dialog').should('exist');
  cy.get('.udc-withdrawal-dialog__amount').type('1');
  cy.wait(2000)
  cy.get('.udc-withdrawal-dialog__button').click()
  cy.getWithCustomTimeout('.udc-withdrawal-dialog').should('not.exist');
  cy.get('.account-route__header__content__back__button').click()
  cy.getWithCustomTimeout('.account-root').should('exist')
}
