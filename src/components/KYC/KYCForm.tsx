import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Upload, CheckCircle, AlertCircle, FileText, Camera } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { KYCData } from '../../types';

const KYCForm: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{[key: string]: File}>({});
  
  const { register, handleSubmit, formState: { errors } } = useForm<KYCData>();

  const onSubmit = async (data: KYCData) => {
    setIsSubmitting(true);
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      updateUser({ kycStatus: 'pending' });
      alert('KYC information submitted successfully! We will review your documents within 24-48 hours.');
    } catch (error) {
      alert('Failed to submit KYC information. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFiles(prev => ({ ...prev, [fieldName]: file }));
    }
  };

  if (user?.kycStatus === 'verified') {
    return (
      <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-200">
        <div className="flex items-center space-x-3">
          <CheckCircle className="w-6 h-6 text-emerald-600" />
          <div>
            <h3 className="text-lg font-semibold text-emerald-900">KYC Verified</h3>
            <p className="text-emerald-700">Your identity has been successfully verified.</p>
          </div>
        </div>
      </div>
    );
  }

  if (user?.kycStatus === 'pending') {
    return (
      <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-amber-600" />
          <div>
            <h3 className="text-lg font-semibold text-amber-900">KYC Under Review</h3>
            <p className="text-amber-700">We are reviewing your documents. This usually takes 24-48 hours.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Complete KYC Verification</h3>
            <p className="text-gray-600">Required for NGN withdrawals above ₦50,000</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                {...register('fullName', { required: 'Full name is required' })}
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your full name"
              />
              {errors.fullName && (
                <p className="text-red-600 text-sm mt-1">{errors.fullName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                {...register('phoneNumber', { 
                  required: 'Phone number is required',
                  pattern: {
                    value: /^(\+234|0)[789][01]\d{8}$/,
                    message: 'Invalid Nigerian phone number'
                  }
                })}
                type="tel"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+234 or 0"
              />
              {errors.phoneNumber && (
                <p className="text-red-600 text-sm mt-1">{errors.phoneNumber.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bank Name *
              </label>
              <select
                {...register('bankName', { required: 'Bank name is required' })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select your bank</option>
                <option value="gtbank">GTBank</option>
                <option value="access">Access Bank</option>
                <option value="zenith">Zenith Bank</option>
                <option value="first">First Bank</option>
                <option value="uba">UBA</option>
                <option value="fidelity">Fidelity Bank</option>
                <option value="union">Union Bank</option>
                <option value="sterling">Sterling Bank</option>
              </select>
              {errors.bankName && (
                <p className="text-red-600 text-sm mt-1">{errors.bankName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Number *
              </label>
              <input
                {...register('accountNumber', { 
                  required: 'Account number is required',
                  pattern: {
                    value: /^\d{10}$/,
                    message: 'Account number must be 10 digits'
                  }
                })}
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="10-digit account number"
              />
              {errors.accountNumber && (
                <p className="text-red-600 text-sm mt-1">{errors.accountNumber.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              BVN (Optional)
            </label>
            <input
              {...register('bvn', {
                pattern: {
                  value: /^\d{11}$/,
                  message: 'BVN must be 11 digits'
                }
              })}
              type="text"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="11-digit BVN"
            />
            {errors.bvn && (
              <p className="text-red-600 text-sm mt-1">{errors.bvn.message}</p>
            )}
          </div>

          {/* File Uploads */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-900">Document Upload</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ID Document (NIN, Driver's License, or Passport) *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileUpload(e, 'idDocument')}
                    className="hidden"
                    id="id-document"
                  />
                  <label htmlFor="id-document" className="cursor-pointer">
                    <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {uploadedFiles.idDocument ? uploadedFiles.idDocument.name : 'Click to upload ID document'}
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proof of Address (Utility Bill) *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileUpload(e, 'proofOfAddress')}
                    className="hidden"
                    id="proof-address"
                  />
                  <label htmlFor="proof-address" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {uploadedFiles.proofOfAddress ? uploadedFiles.proofOfAddress.name : 'Click to upload utility bill'}
                    </p>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Important Notes:</p>
                <ul className="space-y-1">
                  <li>• All documents must be clear and readable</li>
                  <li>• ID document must be government-issued and valid</li>
                  <li>• Utility bill must be dated within the last 3 months</li>
                  <li>• Processing time is typically 24-48 hours</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Submitting...</span>
              </>
            ) : (
              <span>Submit KYC Information</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default KYCForm;