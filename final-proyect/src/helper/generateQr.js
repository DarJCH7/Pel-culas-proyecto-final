import QRCode from "qrcode";

export const generateQr = async (data) => {
    try {
        return await QRCode.toDataURL(data);
    } catch (error) {
        console.error(error);
    }
};
