const {
    calculateFrameDifference
  } = require('./frameExtractor');

  function normalizeScores(items, key) {

    if (!items.length) {
      return items;
    }
  
    const values =
      items.map(item => item[key]);
  
    const min =
      Math.min(...values);
  
    const max =
      Math.max(...values);
  
    return items.map(item => {
  
      let normalized = 0;
  
      if (max !== min) {
  
        normalized =
          (item[key] - min) /
          (max - min);
  
      }
  
      return {
        ...item,
        [`normalized${key.charAt(0).toUpperCase() + key.slice(1)}`]:
          normalized
      };
    });
  }

  function combineScores(
    visualScores,
    audioScores,
    sceneTimestamps = []
  ) {
    const normalizedVisual =
      normalizeScores(
        visualScores,
        'visualScore'
      );
  
    const normalizedAudio =
      normalizeScores(
        audioScores,
        'audioScore'
      );
  
    const audioMap = new Map(
      normalizedAudio.map(item => [
        item.timestamp,
        item.normalizedAudioScore
      ])
    );
  
    const combined =
      normalizedVisual.map(visual => {
  
        const timestamp =
          visual.timestamp;
  
        const visualScore =
          visual.normalizedVisualScore;
  
        const audioScore =
          audioMap.get(timestamp) || 0;
  
        const sceneScore =
          calculateSceneScore(
            timestamp,
            sceneTimestamps
          );
  
        const highlightScore =
          (visualScore * 0.50) +
          (audioScore * 0.30) +
          (sceneScore * 0.20);
  
        return {
          timestamp,
          visualScore,
          audioScore,
          sceneScore,
          highlightScore
        };
      });
  
    return combined.sort(
      (a, b) =>
        b.highlightScore -
        a.highlightScore
    );
  }

  function calculateSceneScore(
    timestamp,
    sceneTimestamps
  ) {
    if (!sceneTimestamps?.length) {
      return 0;
    }
  
    // Strongest score at the exact scene change
    if (
      sceneTimestamps.some(
        scene => Math.abs(scene - timestamp) < 1
      )
    ) {
      return 1;
    }
  
    // Slight influence around the scene change
    if (
      sceneTimestamps.some(
        scene => Math.abs(scene - timestamp) <= 2
      )
    ) {
      return 0.5;
    }
  
    return 0;
  }

  function groupHighlightEvents(
    highlights,
    options = {}
  ) {
  
    const {
      threshold = 0.55,
      maxGap = 4,
      paddingBefore = 5,
      paddingAfter = 10
    } = options;
  
    // Only keep reasonably interesting moments
    const candidates = highlights
      .filter(
        item =>
          item.highlightScore >= threshold
      )
      .sort(
        (a, b) =>
          a.timestamp - b.timestamp
      );
  
    if (!candidates.length) {
      return [];
    }
  
    const events = [];
  
    let currentEvent = {
      start: candidates[0].timestamp,
      end: candidates[0].timestamp,
      peak: candidates[0].timestamp,
      score: candidates[0].highlightScore
    };
  
    for (
      let i = 1;
      i < candidates.length;
      i++
    ) {
  
      const current =
        candidates[i];
  
      const gap =
        current.timestamp -
        currentEvent.end;
  
      // Same event
      if (gap <= maxGap) {
  
        currentEvent.end =
          current.timestamp;
  
        if (
          current.highlightScore >
          currentEvent.score
        ) {
  
          currentEvent.peak =
            current.timestamp;
  
          currentEvent.score =
            current.highlightScore;
        }
  
      } else {
  
        // Save previous event
        events.push({
          ...currentEvent,
  
          start:
            Math.max(
              0,
              currentEvent.start -
                paddingBefore
            ),
  
          end:
            currentEvent.end +
            paddingAfter
        });
  
        // Start new event
        currentEvent = {
          start:
            current.timestamp,
  
          end:
            current.timestamp,
  
          peak:
            current.timestamp,
  
          score:
            current.highlightScore
        };
      }
    }
  
    // Add final event
    events.push({
      ...currentEvent,
  
      start:
        Math.max(
          0,
          currentEvent.start -
            paddingBefore
        ),
  
      end:
        currentEvent.end +
        paddingAfter
    });
  
    // Sort strongest events first
    events.sort(
      (a, b) =>
        b.score - a.score
    );
  
    return events;
  }
  
  async function detectVisualHighlights(
    framePaths
  ) {
  
    const highlights = [];
  
    for (
      let i = 1;
      i < framePaths.length;
      i++
    ) {
  
      const previousFrame =
        framePaths[i - 1];
  
      const currentFrame =
        framePaths[i];
  
      const difference =
        await calculateFrameDifference(
          previousFrame,
          currentFrame
        );
  
      highlights.push({
        timestamp: i,
        visualScore: difference
      });
  
      console.log(
        `Timestamp ${i}s → Visual Score: ${
          difference.toFixed(4)
        }`
      );
    }
  
    highlights.sort(
      (a, b) =>
        b.visualScore -
        a.visualScore
    );
  
    return highlights;
  }

  function removeOverlappingEvents(
    events,
    minimumGap = 10
  ) {
  
    const selected = [];
  
    for (const event of events) {
  
      const overlaps =
        selected.some(
          existing => {
  
            return (
              event.start <
                existing.end +
                  minimumGap
              &&
              event.end >
                existing.start -
                  minimumGap
            );
  
          }
        );
  
      if (!overlaps) {
        selected.push(event);
      }
    }
  
    return selected;
  }
  
  module.exports = {
    detectVisualHighlights,
    combineScores,
    groupHighlightEvents,
    removeOverlappingEvents
  };