function selectTopCandidates(
    highlights,
    limit = 10
  ) {
    return highlights
      .filter(
        item =>
            item.score >= 0.55
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      )
      .slice(0, limit);
  }
  
  module.exports = {
    selectTopCandidates
  };