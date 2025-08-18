import React, { useState } from 'react';
import { Copy, Share2, CheckCircle, AlertCircle } from 'lucide-react';
import { mockUser, mockChains, mockTokens } from '../../utils/mockData';

const DepositsView: React.FC = () => {
  const [selectedChain, setSelectedChain] = useState('ethereum');
  const [copiedAddress, setCopiedAddress] = useState('');

  const userTag = `@${mockUser.tag}`;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(type);
    setTimeout(() => setCopiedAddress(''), 2000);
  };

  const selectedChainData = mockChains.find(chain => chain.id === selectedChain);
  const supportedTokens = mockTokens.filter(token => token.chain === selectedChain);

  return (
    <div className="space-y-6">
      {/* Deposit Instructions */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl p-6 border border-emerald-200">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <AlertCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">How to Receive Crypto</h3>
            <div className="text-gray-700 space-y-1">
              <p>• Share your unique tag <span className="font-mono bg-white px-2 py-1 rounded text-blue-600">{userTag}</span> with senders</p>
              <p>• Funds will appear in your balance once confirmed on-chain</p>
            </div>
          </div>
        </div>
      </div>

      {/* User Tag Card */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Unique Tag</h3>
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-blue-100 mb-1">Send crypto to:</div>
              <div className="text-3xl font-bold">{userTag}</div>
              <div className="text-sm text-blue-100 mt-2">
                Anyone can send you crypto using this tag
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => handleCopy(userTag, 'tag')}
                className="flex items-center space-x-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
              >
                {copiedAddress === 'tag' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="text-sm">Copy Tag</span>
              </button>
              <button className="flex items-center space-x-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors">
                <Share2 className="w-4 h-4" />
                <span className="text-sm">Share</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chain Selection */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Network</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {mockChains.map(chain => (
            <button
              key={chain.id}
              onClick={() => setSelectedChain(chain.id)}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedChain === chain.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-left">
                <div className="font-semibold text-gray-900">{chain.name}</div>
                <div className="text-sm text-gray-500">{chain.symbol}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      
      {/* Supported Tokens */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Supported Tokens on {selectedChainData?.name}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supportedTokens.map(token => (
            <div key={token.symbol} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{token.symbol.slice(0, 2)}</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{token.symbol}</div>
                  <div className="text-sm text-gray-500">{token.name}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Security Reminder</h3>
            <div className="text-gray-700 space-y-1">
              <p>• Only accept crypto from trusted sources</p>
              <p>• Double-check network compatibility before sending funds</p>
              <p>• Large deposits may require additional verification</p>
              <p>• Contact support if you don't see your deposit after 1 hour</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepositsView;