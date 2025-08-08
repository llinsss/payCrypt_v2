import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { Copy, Download, Share2, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const QRCodeGenerator: React.FC = () => {
  const { user } = useAuth();
  const [copiedItem, setCopiedItem] = useState('');
  const [selectedChain, setSelectedChain] = useState('ethereum');

  if (!user) return null;

  const userTag = `@${user.tag}`;
  const depositData = {
    tag: user.tag,
    address: user.walletAddress,
    chain: selectedChain,
    version: '1.0'
  };

  const qrValue = JSON.stringify(depositData);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(type);
    setTimeout(() => setCopiedItem(''), 2000);
  };

  const handleDownload = () => {
    const svg = document.getElementById('qr-code');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `paycrypt-${user.tag}-qr.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      };
      
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Send me crypto!',
          text: `Send crypto to my PayCrypt tag: ${userTag}`,
          url: window.location.origin
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      handleCopy(`Send crypto to my CryptoPay tag: ${userTag}`, 'share');
    }
  };

  return (
    <div className="space-y-6">
      {/* QR Code Display */}
      <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Receive Crypto via QR Code</h3>
        
        <div className="bg-white p-6 rounded-xl border-2 border-gray-100 inline-block mb-6">
          <QRCode
            id="qr-code"
            value={qrValue}
            size={200}
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
            viewBox="0 0 256 256"
          />
        </div>

        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-lg">
            <div className="text-sm text-blue-100 mb-1">Send crypto to:</div>
            <div className="text-2xl font-bold">{userTag}</div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => handleCopy(userTag, 'tag')}
              className="flex items-center justify-center space-x-2 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
            >
              {copiedItem === 'tag' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">Copy Tag</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center justify-center space-x-2 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium">Save QR</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-sm font-medium">Share</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chain Selection */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Select Network</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
            { id: 'starknet', name: 'Starknet', symbol: 'STRK' },
            { id: 'base', name: 'Base', symbol: 'ETH' },
            { id: 'core', name: 'Core', symbol: 'CORE' }
          ].map(chain => (
            <button
              key={chain.id}
              onClick={() => setSelectedChain(chain.id)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                selectedChain === chain.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-gray-900">{chain.name}</div>
              <div className="text-sm text-gray-500">{chain.symbol}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">How to Use</h4>
        <div className="space-y-2 text-sm text-gray-700">
          <p>• Share your QR code or tag with anyone who wants to send you crypto</p>
          <p>• They can scan the QR code with their wallet app</p>
          <p>• Or they can send directly to your tag: <span className="font-mono bg-white px-2 py-1 rounded text-blue-600">{userTag}</span></p>
          <p>• Funds will appear in your balance once confirmed on-chain</p>
        </div>
      </div>
    </div>
  );
};

export default QRCodeGenerator;