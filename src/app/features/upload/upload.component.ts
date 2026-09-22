import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  HttpEventType
} from '@angular/common/http';

import {
  VideoService
} from '../../core/services/video.service';
@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.css'
})
export class UploadComponent implements OnDestroy {

  selectedFile: File | null = null;
  videoPreviewUrl: string | null = null;

  isDragging = false;
  isUploading = false;
  uploadProgress = 0;
  generatedClips: any[] = [];

  isGenerating = false;
  generationProgress = 0;
generationStatus = '';

  errorMessage = '';
  uploadedFilename: string | null = null;

  readonly maxFileSize = 500 * 1024 * 1024; // 500 MB
  readonly allowedTypes = [
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ];

  constructor(
    private videoService: VideoService
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    this.processFile(input.files[0]);

    // Allows selecting the same file again
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;

    if (!event.dataTransfer?.files.length) {
      return;
    }

    this.processFile(event.dataTransfer.files[0]);
  }

  private processFile(file: File): void {

    this.errorMessage = '';

    // Validate file type
    if (!this.allowedTypes.includes(file.type)) {
      this.errorMessage = 'Please select an MP4, WebM or MOV video.';
      return;
    }

    // Validate file size
    if (file.size > this.maxFileSize) {
      this.errorMessage = 'Video size cannot exceed 500 MB.';
      return;
    }

    this.selectedFile = file;

    // Remove previous preview
    if (this.videoPreviewUrl) {
      URL.revokeObjectURL(this.videoPreviewUrl);
    }

    // Create preview
    this.videoPreviewUrl = URL.createObjectURL(file);

    console.log('Selected file:', file);
  }

  removeFile(): void {

    this.selectedFile = null;
    this.errorMessage = '';
    this.uploadProgress = 0;

    if (this.videoPreviewUrl) {
      URL.revokeObjectURL(this.videoPreviewUrl);
      this.videoPreviewUrl = null;
    }
  }

  uploadVideo(): void {
    if (!this.selectedFile) {
      this.errorMessage =
        'Please select a video first.';
  
      return;
    }
  
    this.isUploading = true;
    this.uploadProgress = 0;
    this.errorMessage = '';
  
    this.videoService
      .uploadVideo(this.selectedFile)
      .subscribe({
        next: (event) => {
  
          if (
            event.type ===
            HttpEventType.UploadProgress
          ) {
            if (event.total) {
              this.uploadProgress =
                Math.round(
                  (100 * event.loaded) /
                  event.total
                );
            }
          }
  
          if (
            event.type ===
            HttpEventType.Response
          ) {
            const response =
              event.body;
  
            console.log(
              'Upload response:',
              response
            );
  
            this.uploadedFilename =
              response.video.filename;
  
            this.isUploading = false;
  
            console.log(
              'Uploaded filename:',
              this.uploadedFilename
            );
  
            // Start generating Shorts
            this.generateShorts();
          }
        },
  
        error: (error) => {
          console.error(
            'Upload failed:',
            error
          );
  
          this.isUploading = false;
  
          this.errorMessage =
            error?.error?.message ||
            'Upload failed. Please try again.';
        }
      });
  }

  // private simulateUpload(): void {

  //   this.isUploading = true;
  //   this.uploadProgress = 0;

  //   const interval = setInterval(() => {

  //     this.uploadProgress += 10;

  //     if (this.uploadProgress >= 100) {

  //       clearInterval(interval);

  //       this.uploadProgress = 100;
  //       this.isUploading = false;

  //       console.log('Upload simulation completed.');

  //     }

  //   }, 200);
  // }

  get fileSizeInMB(): string {

    if (!this.selectedFile) {
      return '0';
    }

    return (this.selectedFile.size / (1024 * 1024)).toFixed(2);
  }

  downloadShort(
    clip: any,
    index: number
  ): void {
  
    this.videoService
      .downloadClip(clip.url)
      .subscribe({
        next: (blob) => {
  
          const blobUrl =
            window.URL.createObjectURL(blob);
  
          const anchor =
            document.createElement('a');
  
          anchor.href = blobUrl;
  
          anchor.download =
            clip.filename ||
            `gameclip-short-${index + 1}.mp4`;
  
          document.body.appendChild(anchor);
  
          anchor.click();
  
          document.body.removeChild(anchor);
  
          window.URL.revokeObjectURL(blobUrl);
        },
  
        error: (error) => {
  
          console.error(
            'Failed to download clip:',
            error
          );
  
          this.errorMessage =
            'Failed to download the Short.';
        }
      });
  }


  startGenerationProgress(): void {

    const stages = [
      {
        progress: 10,
        status: 'Preparing video...'
      },
      {
        progress: 25,
        status: 'Extracting video frames...'
      },
      {
        progress: 45,
        status: 'Analyzing gameplay...'
      },
      {
        progress: 60,
        status: 'Analyzing audio...'
      },
      {
        progress: 75,
        status: 'Detecting important moments...'
      },
      {
        progress: 90,
        status: 'Generating your Shorts...'
      }
    ];
  
    let index = 0;
  
    const interval = setInterval(() => {
  
      if (!this.isGenerating || index >= stages.length) {
        clearInterval(interval);
        return;
      }
  
      this.generationProgress =
        stages[index].progress;
  
      this.generationStatus =
        stages[index].status;
  
      index++;
  
    }, 3000);
  }
  generateShorts(): void {
    if (!this.uploadedFilename) {
      this.errorMessage =
        'Video upload failed. Filename not available.';
  
      return;
    }
  
    this.isGenerating = true;
    this.generationProgress = 0;
    this.generationStatus = 'Preparing video...';
    this.errorMessage = '';
  
    // Simulate progress while backend processes
    this.startGenerationProgress();
  
    this.videoService
      .generateShorts(this.uploadedFilename)
      .subscribe({
        next: (response) => {
  
          this.generatedClips =
            response.clips || [];
  
          this.generationProgress = 100;
          this.generationStatus =
            'Shorts generated successfully!';
  
          this.isGenerating = false;
  
        },
  
        error: (error) => {
  
          console.error(
            'Short generation failed:',
            error
          );
  
          this.isGenerating = false;
          this.generationProgress = 0;
  
          this.errorMessage =
            error?.error?.message ||
            'Failed to generate Shorts.';
        }
      });
  }

  ngOnDestroy(): void {

    if (this.videoPreviewUrl) {
      URL.revokeObjectURL(this.videoPreviewUrl);
    }
  }
}