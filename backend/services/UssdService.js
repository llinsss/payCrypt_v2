const db = require('../config/database');
const PaymentService = require('./PaymentService');

class UssdService {
  constructor() {
    this.sessions = new Map();
  }

  async handleUssdRequest(sessionId, phoneNumber, text) {
    const session = this.getOrCreateSession(sessionId, phoneNumber);
    
    if (text === '') {
      return this.showMainMenu();
    }

    const inputs = text.split('*');
    const level = inputs.length;

    switch (inputs[0]) {
      case '1': return await this.handleSendMoney(session, inputs, level);
      case '2': return await this.handleCheckBalance(session, phoneNumber);
      case '3': return await this.handleTransactionHistory(session, phoneNumber);
      case '4': return await this.handleMyTag(session, phoneNumber);
      default: return this.showError('Invalid option');
    }
  }

  showMainMenu() {
    return {
      message: 'CON Welcome to Tagged\n1. Send Money\n2. Check Balance\n3. Transaction History\n4. My @Tag',
      continueSession: true
    };
  }

  async handleSendMoney(session, inputs, level) {
    if (level === 1) {
      return {
        message: 'CON Enter recipient @tag\n(e.g., @john)',
        continueSession: true
      };
    }

    if (level === 2) {
      const recipientTag = inputs[1];
      if (!recipientTag.startsWith('@')) {
        return this.showError('Tag must start with @');
      }
      session.recipientTag = recipientTag;
      return {
        message: 'CON Enter amount (NGN)',
        continueSession: true
      };
    }

    if (level === 3) {
      const amount = parseFloat(inputs[2]);
      if (isNaN(amount) || amount <= 0) {
        return this.showError('Invalid amount');
      }
      session.amount = amount;
      return {
        message: `CON Send ${amount} NGN to ${session.recipientTag}?\n1. Confirm\n2. Cancel`,
        continueSession: true
      };
    }

    if (level === 4) {
      if (inputs[3] === '1') {
        return await this.processSendMoney(session);
      }
      return this.showError('Transaction cancelled');
    }

    return this.showError('Invalid input');
  }

  async processSendMoney(session) {
    try {
      const user = await this.getUserByPhone(session.phoneNumber);
      if (!user) {
        return this.showError('User not found. Register at taggedpay.xyz');
      }

      const result = await PaymentService.createPayment({
        senderId: user.id,
        recipientTag: session.recipientTag,
        amount: session.amount,
        currency: 'NGN',
        channel: 'ussd'
      });

      this.clearSession(session.id);
      return {
        message: `END Payment successful!\nSent ${session.amount} NGN to ${session.recipientTag}\nRef: ${result.reference}`,
        continueSession: false
      };
    } catch (error) {
      return this.showError(error.message);
    }
  }

  async handleCheckBalance(session, phoneNumber) {
    try {
      const user = await this.getUserByPhone(phoneNumber);
      if (!user) {
        return this.showError('User not found');
      }

      const balances = await db('balances')
        .where({ user_id: user.id })
        .select('token_symbol', 'amount', 'chain_name');

      if (balances.length === 0) {
        return {
          message: 'END No balances found',
          continueSession: false
        };
      }

      let message = 'END Your Balances:\n';
      balances.forEach(b => {
        message += `${b.token_symbol}: ${b.amount} (${b.chain_name})\n`;
      });

      return { message, continueSession: false };
    } catch (error) {
      return this.showError(error.message);
    }
  }

  async handleTransactionHistory(session, phoneNumber) {
    try {
      const user = await this.getUserByPhone(phoneNumber);
      if (!user) {
        return this.showError('User not found');
      }

      const transactions = await db('transactions')
        .where({ user_id: user.id })
        .orderBy('created_at', 'desc')
        .limit(5)
        .select('amount', 'recipient_tag', 'status', 'created_at');

      if (transactions.length === 0) {
        return {
          message: 'END No transactions found',
          continueSession: false
        };
      }

      let message = 'END Recent Transactions:\n';
      transactions.forEach(t => {
        message += `${t.amount} to ${t.recipient_tag} - ${t.status}\n`;
      });

      return { message, continueSession: false };
    } catch (error) {
      return this.showError(error.message);
    }
  }

  async handleMyTag(session, phoneNumber) {
    try {
      const user = await this.getUserByPhone(phoneNumber);
      if (!user) {
        return this.showError('User not found');
      }

      return {
        message: `END Your Tagged @tag:\n${user.tag}\n\nShare this to receive payments!`,
        continueSession: false
      };
    } catch (error) {
      return this.showError(error.message);
    }
  }

  async getUserByPhone(phoneNumber) {
    const normalized = phoneNumber.replace(/\D/g, '');
    return await db('users')
      .where({ phone: normalized })
      .orWhere({ phone: `+${normalized}` })
      .first();
  }

  getOrCreateSession(sessionId, phoneNumber) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        phoneNumber,
        createdAt: Date.now()
      });
    }
    return this.sessions.get(sessionId);
  }

  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  showError(message) {
    return {
      message: `END Error: ${message}`,
      continueSession: false
    };
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > timeout) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

module.exports = new UssdService();
