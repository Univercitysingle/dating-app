import React from 'react';

const SectionCard = React.memo(({ title, children, onEdit, isEditing }) => (
    <div className="bg-neutral-100 dark:bg-neutral-800 p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-50">{title}</h2>
            {onEdit && (
                <button
                    onClick={onEdit}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                >
                    {isEditing ? 'Cancel' : 'Edit'}
                </button>
            )}
        </div>
        {children}
    </div>
));

export default SectionCard;