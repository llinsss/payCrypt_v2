import BatchPaymentService from "../services/BatchPaymentService.js";

export const createBatchPayment = async (req, res) => {
    try {
        const {
            senderTag,
            payments,
            atomic = true,
            asset = "XLM",
            assetIssuer = null,
            memo = null,
        } = req.body;

        // Validate maximum 100 payments
        if (!Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Payments must be a non-empty array",
            });
        }

        if (payments.length > 100) {
            return res.status(400).json({
                success: false,
                error: "Maximum 100 payments allowed per batch",
            });
        }

        const result = await BatchPaymentService.createBatchPayment({
            userId: req.user.id,
            senderTag,
            payments,
            atomic,
            asset,
            assetIssuer,
            memo,
        });

        return res.status(result.httpStatus).json({
            success: result.success,
            message: result.message,
            data: result.data,
        });
    } catch (error) {
        console.error("Batch payment processing error:", error);

        const statusCode = error.statusCode || 500;

        return res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
};

export const getBatchPaymentStatus = async (req, res) => {
    try {
        const batch = await BatchPaymentService.getBatchStatus({
            batchId: req.params.id,
            userId: req.user.id,
        });

        if (!batch) {
            return res.status(404).json({
                success: false,
                error: "Batch payment not found",
            });
        }

        return res.json({
            success: true,
            data: batch,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
