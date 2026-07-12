const lessons = {
    'les-01': {
        id: 'les-01',
        number: 'Les 1',
        title: 'Eerste opdrachten',
        previous: null,
        next: 'les-02',
        categories: [
            'modellabsdevice'
        ]
    },

    'les-02': {
        id: 'les-02',
        number: 'Les 2',
        title: 'Touch en gebeurtenissen',
        previous: 'les-01',
        next: 'les-03',
        categories: [
            'modellabsdevice',
            'event'
        ]
    },

    'les-03': {
        id: 'les-03',
        number: 'Les 3',
        title: 'Voorwaarden en herhaling',
        previous: 'les-02',
        next: null,
        categories: [
            'modellabsdevice',
            'event',
            'control',
            'operators'
        ]
    }
};

export const getLessonId = () => {
    const params = new URLSearchParams(window.location.search);

    return params.get('lesson') || 'les-01';
};

export const getLesson = lessonId => (
    lessons[lessonId] || lessons['les-01']
);

export const getCurrentLesson = () => (
    getLesson(getLessonId())
);

export default lessons;