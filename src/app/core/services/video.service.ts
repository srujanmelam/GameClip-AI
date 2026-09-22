import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpEvent,
  HttpEventType
} from '@angular/common/http';

import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class VideoService {

  private readonly API_URL =
    'http://localhost:3000/api/videos';

  constructor(
    private http: HttpClient
  ) {}

  uploadVideo(
    file: File
  ): Observable<HttpEvent<any>> {

    const formData = new FormData();

    formData.append(
      'video',
      file
    );

    return this.http.post(
      `${this.API_URL}/upload`,
      formData,
      {
        reportProgress: true,
        observe: 'events'
      }
    );
  }

  generateShorts(filename: string): Observable<any> {
    return this.http.post(
      `${this.API_URL}/${filename}/generate-ai-shorts`,
      {}
    );
  }
  downloadClip(url: string): Observable<Blob> {
    return this.http.get(url, {
      responseType: 'blob'
    });
  }

}