import React, { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  FileText,
  Camera,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { KYCData } from "../../types";
import { apiClient } from "../../utils/api";

// Cloudinary configuration - replace with your actual values
const CLOUDINARY_UPLOAD_PRESET = "default"; // Replace with your upload preset
const CLOUDINARY_CLOUD_NAME = "dfvxv2mpj"; // Replace with your cloud name

interface KYCFormData
  extends Omit<KYCData, "id_document_url" | "proof_of_address_url"> {
  id_document_url?: string;
  proof_of_address_url?: string;
}

const KYCForm: React.FC = () => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ [key: string]: File }>(
    {}
  );
  const [uploadingFiles, setUploadingFiles] = useState<{
    [key: string]: boolean;
  }>({});

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<KYCFormData>();

  // Watch for uploaded file URLs
  const idDocumentUrl = watch("id_document_url");
  const proofOfAddressUrl = watch("proof_of_address_url");

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", "kyc_documents"); // Optional: organize uploads in folders

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error("Failed to upload image to Cloudinary");
    }

    const data = await response.json();
    return data.secure_url;
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    fieldName: string
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];
    if (!validTypes.includes(file.type)) {
      alert("Please upload only JPEG, PNG, or PDF files");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    setUploadedFiles((prev) => ({ ...prev, [fieldName]: file }));
    setUploadingFiles((prev) => ({ ...prev, [fieldName]: true }));

    try {
      const secureUrl = await uploadToCloudinary(file);

      // Set the URL in the form
      if (fieldName === "id_document") {
        setValue("id_document_url", secureUrl);
      } else if (fieldName === "proof_of_address") {
        setValue("proof_of_address_url", secureUrl);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload file. Please try again.");
      // Remove the file from state if upload failed
      setUploadedFiles((prev) => {
        const newFiles = { ...prev };
        delete newFiles[fieldName];
        return newFiles;
      });
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [fieldName]: false }));
    }
  };

  const onSubmit = async (data: KYCFormData) => {
    // Validate that required documents are uploaded
    if (!data.id_document_url) {
      alert("Please upload your ID document");
      return;
    }
    if (!data.proof_of_address_url) {
      alert("Please upload your proof of address");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.post("/kycs", {
        full_name: data.full_name,
        phone_number: data.phone_number,
        bank_name: data.bank_name,
        account_number: data.account_number,
        bvn: data.bvn || null,
        id_document: data.id_document_url,
        proof_of_address: data.proof_of_address_url,
      });

      console.log(response);

      alert(
        "KYC information submitted successfully! We will review your documents within 24-48 hours."
      );
    } catch (error) {
      console.error("KYC submission failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to submit KYC information. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user?.kyc_status === "verified") {
    return (
      <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-200">
        <div className="flex items-center space-x-3">
          <CheckCircle className="w-6 h-6 text-emerald-600" />
          <div>
            <h3 className="text-lg font-semibold text-emerald-900">
              KYC Verified
            </h3>
            <p className="text-emerald-700">
              Your identity has been successfully verified.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (user?.kyc_status === "pending") {
    return (
      <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-amber-600" />
          <div>
            <h3 className="text-lg font-semibold text-amber-900">
              KYC Under Review
            </h3>
            <p className="text-amber-700">
              We are reviewing your documents. This usually takes 24-48 hours.
            </p>
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
            <h3 className="text-xl font-semibold text-gray-900">
              Complete KYC Verification
            </h3>
            <p className="text-gray-600">
              Required for NGN withdrawals above ₦50,000
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                {...register("full_name", {
                  required: "Full name is required",
                })}
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your full name"
              />
              {errors.full_name && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.full_name.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                {...register("phone_number", {
                  required: "Phone number is required",
                  pattern: {
                    value: /^(\+234|0)[789][01]\d{8}$/,
                    message: "Invalid Nigerian phone number",
                  },
                })}
                type="tel"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+234 or 0"
              />
              {errors.phone_number && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.phone_number.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="bank_name" className="block text-sm font-medium text-gray-700 mb-2">
                Bank Name *
              </label>
              <select
                {...register("bank_name", {
                  required: "Bank name is required",
                })}
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
              {errors.bank_name && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.bank_name.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="account_number" className="block text-sm font-medium text-gray-700 mb-2">
                Account Number *
              </label>
              <input
                {...register("account_number", {
                  required: "Account number is required",
                  pattern: {
                    value: /^\d{10}$/,
                    message: "Account number must be 10 digits",
                  },
                })}
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="10-digit account number"
              />
              {errors.account_number && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.account_number.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="bvn" className="block text-sm font-medium text-gray-700 mb-2">
              BVN (Optional)
            </label>
            <input
              {...register("bvn", {
                pattern: {
                  value: /^\d{11}$/,
                  message: "BVN must be 11 digits",
                },
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
            <h4 className="text-lg font-semibold text-gray-900">
              Document Upload
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label  htmlFor="id_document" className="block text-sm font-medium text-gray-700 mb-2">
                  ID Document (NIN, Driver's License, or Passport) *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileUpload(e, "id_document")}
                    className="hidden"
                    id="id-document"
                    disabled={uploadingFiles.id_document}
                  />
                  <label htmlFor="id-document" className="cursor-pointer">
                    {uploadingFiles.id_document ? (
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
                        <p className="text-sm text-blue-600">Uploading...</p>
                      </div>
                    ) : idDocumentUrl ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
                        <p className="text-sm text-green-600">
                          {uploadedFiles.id_document?.name ||
                            "Document uploaded"}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Camera className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-600">
                          Click to upload ID document
                        </p>
                      </div>
                    )}
                  </label>
                </div>
                {!idDocumentUrl && (
                  <p className="text-red-600 text-sm mt-1">
                    ID document is required
                  </p>
                )}
              </div>

              <div>
                <label  htmlFor="proof_of_address" className="block text-sm font-medium text-gray-700 mb-2">
                  Proof of Address (Utility Bill) *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileUpload(e, "proof_of_address")}
                    className="hidden"
                    id="proof-address"
                    disabled={uploadingFiles.proof_of_address}
                  />
                  <label htmlFor="proof-address" className="cursor-pointer">
                    {uploadingFiles.proof_of_address ? (
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
                        <p className="text-sm text-blue-600">Uploading...</p>
                      </div>
                    ) : proofOfAddressUrl ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
                        <p className="text-sm text-green-600">
                          {uploadedFiles.proof_of_address?.name ||
                            "Document uploaded"}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-600">
                          Click to upload utility bill
                        </p>
                      </div>
                    )}
                  </label>
                </div>
                {!proofOfAddressUrl && (
                  <p className="text-red-600 text-sm mt-1">
                    Proof of address is required
                  </p>
                )}
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
                  <li>• Maximum file size: 5MB per document</li>
                  <li>• Accepted formats: JPEG, PNG, PDF</li>
                  <li>• Processing time is typically 24-48 hours</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              uploadingFiles.id_document ||
              uploadingFiles.proof_of_address ||
              !idDocumentUrl ||
              !proofOfAddressUrl
            }
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
