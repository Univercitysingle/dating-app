export const validateMobileNumber = (value) => {
    if (value.startsWith('+')) {
        return '+' + value.substring(1).replace(/[^0-9]/g, '');
    }
    return value.replace(/[^0-9]/g, '');
};
