import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';

interface Photo {
  id: string;
  url: string;
}

interface SortablePhotoItemProps {
  photo: Photo;
  onDelete: (id: string) => void;
}

const SortablePhotoItem = ({ photo, onDelete }: SortablePhotoItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative aspect-square">
      <img src={photo.url} alt="Profile" className="object-cover w-full h-full rounded-lg" />
      <button
        onClick={() => onDelete(photo.id)}
        className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center"
      >
        &times;
      </button>
    </div>
  );
};

interface SortablePhotoGridProps {
  photos: Photo[];
  onReorder: (photos: Photo[]) => void;
  onDelete: (id: string) => void;
}

export const SortablePhotoGrid = ({ photos, onReorder, onDelete }: SortablePhotoGridProps) => {
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = photos.findIndex((p) => p.id === active.id);
      const newIndex = photos.findIndex((p) => p.id === over.id);
      const newOrder = arrayMove(photos, oldIndex, newIndex);
      onReorder(newOrder);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-4">
          {photos.map((photo) => (
            <SortablePhotoItem key={photo.id} photo={photo} onDelete={onDelete} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
